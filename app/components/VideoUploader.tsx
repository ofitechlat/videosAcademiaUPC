'use client';
import { useState } from 'react';
import { Upload, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { saveVideo } from '../utils/storage';
import { VideoData, UploadProgress } from '../types';

export default function VideoUploader({ onComplete }: { onComplete: (id: string) => void }) {
    const [status, setStatus] = useState<UploadProgress | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [youtubeUrl, setYoutubeUrl] = useState('');

    const processVideo = async (file: File) => {
        try {
            setError(null);
            setStatus({ stage: 'compressing', progress: 0, message: 'Iniciando subida al servidor...' });

            const formData = new FormData();
            formData.append('file', file);

            // Usamos XMLHttpRequest para poder rastrear el progreso de subida real
            const xhr = new XMLHttpRequest();

            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    const percent = Math.round((event.loaded / event.total) * 40);
                    setStatus({
                        stage: 'compressing',
                        progress: percent,
                        message: `Subiendo video... ${percent}%`
                    });
                }
            };

            // FIX: Usar onload para cambiar estado SOLO cuando termine la subida
            xhr.upload.onload = () => {
                setStatus({
                    stage: 'transcribing',
                    progress: 45,
                    message: 'Subida completa. Procesando en Backend (Audio -> Gemini)...'
                });
            };

            const responsePromise = new Promise<any>((resolve, reject) => {
                xhr.onreadystatechange = () => {
                    if (xhr.readyState === 4) {
                        if (xhr.status === 200) {
                            try {
                                resolve(JSON.parse(xhr.responseText));
                            } catch (e) {
                                reject(new Error('Error al leer la respuesta del servidor (JSON inválido)'));
                            }
                        } else {
                            try {
                                const errorData = JSON.parse(xhr.responseText);
                                reject(new Error(errorData.detail || `Error ${xhr.status}: ${xhr.statusText}`));
                            } catch (e) {
                                reject(new Error(`Error del servidor: ${xhr.statusText}`));
                            }
                        }
                    }
                };
            });

            xhr.open('POST', 'http://localhost:8000/process');
            xhr.send(formData);

            // Eliminamos el setStatus manual aquí para evitar race condition

            const result = await responsePromise;

            const API_BASE = 'http://localhost:8000';
            const parts = result.parts || [result.videoUrl.replace('/static/', '')];

            // Descargar todas las partes (blobs) SOLO si no hay YouTube
            const partBlobs: { name: string, blob: Blob }[] = [];
            if (!youtubeUrl) {
                setStatus({ stage: 'summarizing', progress: 95, message: 'Descargando partes para almacenamiento local...' });
                for (let i = 0; i < parts.length; i++) {
                    setStatus({
                        stage: 'summarizing',
                        progress: 95 + (i / parts.length * 3),
                        message: `Descargando parte ${i + 1} de ${parts.length}...`
                    });
                    const resp = await fetch(`${API_BASE}/static/${parts[i]}`);
                    const blob = await resp.blob();
                    partBlobs.push({ name: parts[i], blob });
                }
            } else {
                setStatus({ stage: 'summarizing', progress: 97, message: 'Vinculando con YouTube...' });
            }

            // Mapeo Transcripcion
            const mappedTranscription = {
                text: result.transcription.text,
                segments: result.transcription.segments.map((seg: any, idx: number) => ({
                    id: `seg-${idx}`,
                    startTime: seg.start,
                    endTime: seg.end,
                    text: seg.text
                }))
            };

            // Mapeo Resumen
            const mappedSummary = {
                fullSummary: result.summary.summary,
                sections: result.summary.sections.map((sec: any, idx: number) => ({
                    id: `sec-${idx}`,
                    title: sec.title,
                    timestamp: sec.start,
                    duration: 0,
                    content: sec.content
                })),
                keyPoints: result.summary.keyPoints || []
            };

            const videoData: VideoData = {
                id: result.videoId,
                title: result.title,
                duration: result.duration || 0,
                thumbnail: '',
                originalSize: file.size,
                compressedSize: partBlobs.length > 0 ? partBlobs.reduce((acc, p) => acc + p.blob.size, 0) : 0,
                transcription: mappedTranscription,
                summary: mappedSummary,
                parts: youtubeUrl ? [] : parts,
                youtubeUrl: youtubeUrl || undefined,
                createdAt: new Date().toISOString()
            };

            setStatus({ stage: 'summarizing', progress: 98, message: 'Guardando metadatos en Supabase...' });
            await saveVideo(videoData, null, partBlobs.length > 0 ? partBlobs : undefined);
            setStatus({ stage: 'complete', progress: 100, message: '¡Procesamiento completado!' });

            setTimeout(() => onComplete(result.videoId), 1500);

        } catch (err: any) {
            console.error(err);
            let userMessage = err.message || 'Error al procesar el video';

            if (err.message?.includes('exceeded the maximum allowed size') || err.name === 'StorageApiError') {
                userMessage = '❌ El video es demasiado pesado para la configuración actual de Supabase. Aumenta el límite en el Dashboard de Supabase (Settings -> Storage) o sube un video más corto.';
            }

            setError(userMessage);
            setStatus(null);
        }
    };

    return (
        <div className="max-w-2xl mx-auto p-10 border-2 border-dashed border-white/10 rounded-[2.5rem] bg-[#16181a] shadow-2xl hover:border-blue-500/50 transition-all duration-500 group/uploader">
            {!status ? (
                <div className="flex flex-col items-center justify-center space-y-6">
                    <div className="p-6 bg-blue-600/10 rounded-3xl text-blue-500 group-hover/uploader:scale-110 group-hover/uploader:bg-blue-600/20 transition-all duration-500">
                        <Upload size={48} strokeWidth={2.5} />
                    </div>
                    <div className="text-center w-full">
                        <h3 className="text-2xl font-bold text-white tracking-tight">Cargar nuevo video</h3>
                        <p className="text-gray-400 mt-2 max-w-xs mx-auto mb-6">Sube el archivo para procesar la IA y conecta su link de YouTube</p>

                        {/* Input de YouTube */}
                        <div className="max-w-md mx-auto mb-8 bg-black/40 p-1.5 rounded-2xl border border-white/5 focus-within:border-blue-500/50 transition-all group/yt">
                            <input
                                type="url"
                                placeholder="Link de YouTube (Donde se subió este video)..."
                                value={youtubeUrl}
                                onChange={(e) => setYoutubeUrl(e.target.value)}
                                className="w-full bg-transparent border-none focus:ring-0 text-sm text-white px-4 py-2 placeholder:text-gray-600"
                            />
                        </div>

                        <div className="flex items-center justify-center gap-2 mb-4">
                            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                            <span className="text-[10px] font-black uppercase tracking-widest text-green-500/80">
                                Motor Python & Gemini 3 Flash Pro Activos
                            </span>
                        </div>
                    </div>
                    <label className="px-8 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold cursor-pointer transition-all hover:shadow-xl hover:shadow-blue-900/40 active:scale-95">
                        Seleccionar archivo
                        <input
                            type="file"
                            className="hidden"
                            accept="video/*,.mkv,.m4v"
                            onChange={(e) => e.target.files?.[0] && processVideo(e.target.files[0])}
                        />
                    </label>
                    <p className="text-[10px] text-gray-600 font-medium uppercase tracking-tighter">MP4, MKV, AVI, MOV • Max 2GB</p>
                </div>
            ) : (
                <div className="space-y-8 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                            {status.stage === 'complete' ? (
                                <div className="w-10 h-10 bg-green-500/20 rounded-full flex items-center justify-center text-green-500">
                                    <CheckCircle2 size={24} />
                                </div>
                            ) : (
                                <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center text-blue-500">
                                    <Loader2 className="animate-spin" size={24} />
                                </div>
                            )}
                            <div>
                                <h4 className="font-bold text-white text-lg">{status.message}</h4>
                                <p className="text-sm text-gray-500 capitalize">{status.stage}</p>
                            </div>
                        </div>
                        <span className="text-2xl font-black text-blue-500">{status.progress}%</span>
                    </div>

                    <div className="relative w-full bg-white/5 rounded-full h-4 overflow-hidden border border-white/5">
                        <div
                            className="bg-gradient-to-r from-blue-600 to-indigo-500 h-full transition-all duration-700 ease-out shadow-[0_0_20px_rgba(59,130,246,0.5)]"
                            style={{ width: `${status.progress}%` }}
                        />
                    </div>

                    <div className="grid grid-cols-4 gap-4 px-2">
                        {[
                            { id: 'compressing', label: 'Subida' },
                            { id: 'transcribing', label: 'IA Transcriber' },
                            { id: 'summarizing', label: 'IA Resumen' },
                            { id: 'complete', label: 'Listo' }
                        ].map((step, idx) => {
                            const isActive = status.stage === step.id;
                            const isDone = (
                                (step.id === 'compressing' && status.progress > 40) ||
                                (step.id === 'transcribing' && status.progress > 80) ||
                                (step.id === 'summarizing' && status.progress > 95) ||
                                status.stage === 'complete'
                            );

                            return (
                                <div key={step.id} className="flex flex-col gap-2">
                                    <div className={`h-1.5 rounded-full transition-colors duration-500 ${isDone ? 'bg-green-500' : isActive ? 'bg-blue-500' : 'bg-white/5'}`}></div>
                                    <span className={`text-[10px] font-black uppercase tracking-tighter text-center ${isDone ? 'text-green-500/70' : isActive ? 'text-blue-500' : 'text-gray-600'}`}>
                                        {step.label}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {error && (
                <div className="mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center space-x-3 text-red-400 animate-in zoom-in-95 duration-300">
                    <AlertCircle size={20} />
                    <span className="text-sm font-medium">{error}</span>
                </div>
            )}
        </div>
    );
}

