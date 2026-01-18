'use client';
import { useState } from 'react';
import { Upload, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { saveVideo } from '../utils/storage';
import { VideoData, UploadProgress } from '../types';

export default function VideoUploader({ onComplete }: { onComplete: (id: string) => void }) {
    const [status, setStatus] = useState<UploadProgress | null>(null);
    const [error, setError] = useState<string | null>(null);

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
                            resolve(JSON.parse(xhr.responseText));
                        } else {
                            reject(new Error(`Error del servidor: ${xhr.statusText}`));
                        }
                    }
                };
            });

            xhr.open('POST', 'http://localhost:8000/process');
            xhr.send(formData);

            // Eliminamos el setStatus manual aquí para evitar race condition

            const result = await responsePromise;

            setStatus({ stage: 'summarizing', progress: 95, message: 'Video procesado. Descargando resultados...' });

            // Mapeo de datos Backend -> Frontend y descarga de blob para persistencia
            const API_BASE = 'http://localhost:8000';
            const videoUrl = `${API_BASE}${result.videoUrl}`;
            const videoBlobResp = await fetch(videoUrl);
            const videoBlob = await videoBlobResp.blob();

            // Mapeo Transcripcion (start/end -> startTime/endTime)
            const mappedTranscription = {
                text: result.transcription.text,
                segments: result.transcription.segments.map((seg: any, idx: number) => ({
                    id: `seg-${idx}`,
                    startTime: seg.start,
                    endTime: seg.end,
                    text: seg.text
                }))
            };

            // Mapeo Resumen (summary -> fullSummary, start -> timestamp)
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
                duration: 0,
                thumbnail: '',
                originalSize: file.size,
                compressedSize: videoBlob.size,
                transcription: mappedTranscription,
                summary: mappedSummary,
                createdAt: new Date().toISOString()
            };

            setStatus({ stage: 'summarizing', progress: 98, message: 'Guardando video en la nube (Supabase)...' });
            await saveVideo(videoData, videoBlob);

            setStatus({ stage: 'complete', progress: 100, message: '¡Procesamiento completado!' });

            // Pequeño delay para que el usuario vea el check verde
            setTimeout(() => onComplete(result.videoId), 1500);

        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Error al procesar el video');
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
                    <div className="text-center">
                        <h3 className="text-2xl font-bold text-white tracking-tight">Cargar nuevo video</h3>
                        <p className="text-gray-400 mt-2 max-w-xs mx-auto">Sube cualquier video para obtener un resumen inteligente estructurado</p>
                        <div className="flex items-center justify-center gap-2 mt-4">
                            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                            <span className="text-[10px] font-black uppercase tracking-widest text-green-500/80">
                                Motor Python & Gemini 3 Activos
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

