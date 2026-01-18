'use client';
import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft, Share2, Download, Trash2 } from 'lucide-react';
import { getVideo, deleteVideo } from '../../utils/storage';
import { VideoData } from '../../types';
import SummaryPanel from '../../components/SummaryPanel';

export default function WatchPage() {
    const { id: rawId } = useParams();
    const id = rawId ? decodeURIComponent(rawId as string) : null;
    const router = useRouter();

    const [data, setData] = useState<{ video: VideoData; videoUrl: string } | null>(null);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0); // For filtering hallucinations
    const [error, setError] = useState<string | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const loadingRef = useRef<string | null>(null);

    useEffect(() => {
        if (id && loadingRef.current !== id) {
            loadingRef.current = id;
            console.log('🎬 Iniciando carga de video (Single Pass):', id);

            getVideo(id).then(result => {
                if (result) {
                    const url = URL.createObjectURL(result.blob);
                    setData({ video: result.video, videoUrl: url });
                } else {
                    console.error('Video no encontrado en DB:', id);
                    setError('Video no encontrado. Intenta subirlo de nuevo.');
                }
            }).catch(e => {
                console.error('Error cargando video:', e);
                setError('Error al recuperar datos: ' + e.message);
            });
        }

    }, [id]);

    useEffect(() => {
        return () => {
            if (data?.videoUrl) {
                console.log('🧹 Limpiando recurso de video');
                URL.revokeObjectURL(data.videoUrl);
            }
        };
    }, [data?.videoUrl]);

    if (!data) return (
        <div className="flex items-center justify-center h-screen bg-gray-50">
            <div className="text-center">
                {error ? (
                    <div className="text-red-500">
                        <p className="text-lg font-bold mb-2">Error 😕</p>
                        <p>{error}</p>
                        <button
                            onClick={() => router.push('/')}
                            className="mt-4 text-blue-500 hover:underline"
                        >
                            Volver al Inicio
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                        <p className="mt-4 text-gray-600 font-medium">Cargando video y resumen...</p>
                    </>
                )}
            </div>
        </div>
    );

    const handleTimestampClick = (time: number) => {
        if (videoRef.current) {
            videoRef.current.currentTime = time;
            videoRef.current.play();
        }
    };

    const handleDelete = async () => {
        if (confirm('¿Estás seguro de que quieres eliminar este video?')) {
            await deleteVideo(id as string);
            router.push('/');
        }
    };

    return (
        <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
            {/* Header */}
            <header className="bg-white border-b px-6 py-4 flex items-center justify-between shrink-0 shadow-sm z-10">
                <div className="flex items-center gap-4">
                    <button onClick={() => router.push('/')} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                        <ChevronLeft size={24} />
                    </button>
                    <h1 className="text-lg font-bold text-gray-800 truncate max-w-md">
                        {data.video.title}
                    </h1>
                </div>
                <div className="flex items-center gap-2">
                    <button className="p-2 hover:bg-gray-100 rounded-full text-gray-600">
                        <Share2 size={20} />
                    </button>
                    <button onClick={() => {
                        const a = document.createElement('a');
                        a.href = data.videoUrl;
                        a.download = data.video.title;
                        a.click();
                    }} className="p-2 hover:bg-gray-100 rounded-full text-gray-600" title="Descargar video comprimido">
                        <Download size={20} />
                    </button>
                    <button onClick={handleDelete} className="p-2 hover:bg-red-50 rounded-full text-red-500 transition-colors">
                        <Trash2 size={20} />
                    </button>
                </div>
            </header>

            {/* Main Split Content */}
            <main className="flex-1 flex overflow-hidden">
                {/* Lado Izquierdo: Resumen (50%) */}
                <div className="w-1/2 border-r shadow-inner bg-white">
                    <SummaryPanel
                        summary={data.video.summary}
                        currentTime={currentTime}
                        videoDuration={duration}
                        onTimestampClick={handleTimestampClick}
                    />
                </div>

                {/* Lado Derecho: Video (50%) */}
                <div className="w-1/2 bg-black flex flex-col items-center justify-center p-8">
                    <div className="w-full max-w-4xl bg-black rounded-2xl overflow-hidden shadow-2xl border border-gray-800 aspect-video relative group">
                        <video
                            ref={videoRef}
                            src={data.videoUrl}
                            controls
                            className="w-full h-full object-contain"
                            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                            onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
                        />
                    </div>

                    <div className="mt-8 text-center text-gray-400 max-w-lg">
                        <p className="text-sm font-medium text-white mb-2">💡 Tip de Navegación</p>
                        <p className="text-xs">
                            Haz clic en cualquier sección del resumen a la izquierda para saltar
                            automáticamente a ese momento en el video.
                        </p>
                    </div>
                </div>
            </main>
        </div>
    );
}
