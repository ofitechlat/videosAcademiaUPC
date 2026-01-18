'use client';
import { Play, FileText, List, Sparkles } from 'lucide-react';
import { VideoSummary } from '../types';

interface SummaryPanelProps {
    summary: VideoSummary;
    currentTime: number;
    videoDuration: number; // Nueva prop
    onTimestampClick: (time: number) => void;
}

export default function SummaryPanel({ summary, currentTime, videoDuration, onTimestampClick }: SummaryPanelProps) {
    // Filtrar alucinaciones: Si el timestamp es mayor a la duración real del video (+5s margen), no lo mostramos.
    // Solo filtrarmos si videoDuration > 0 (ya cargó metadata)
    const validSections = summary.sections.filter(section => {
        if (videoDuration === 0) return true;
        return section.timestamp < (videoDuration + 5);
    });

    return (
        <div className="h-full overflow-y-auto bg-white p-6 custom-scrollbar">
            <div className="space-y-8">
                {/* Resumen General */}
                <section>
                    <div className="flex items-center gap-2 mb-3">
                        <Sparkles className="text-blue-500" size={20} />
                        <h2 className="text-xl font-bold text-gray-800">Resumen General</h2>
                    </div>
                    <p className="text-gray-600 leading-relaxed text-sm">
                        {summary.fullSummary}
                    </p>
                </section>

                {/* Secciones con Timestamps */}
                <section>
                    <div className="flex items-center gap-2 mb-4">
                        <List className="text-blue-500" size={20} />
                        <h2 className="text-lg font-bold text-gray-800">Secciones del Video</h2>
                    </div>
                    <div className="space-y-4">
                        {validSections.length === 0 ? (
                            <p className="text-gray-400 italic text-sm">Cargando secciones...</p>
                        ) : (
                            validSections.map((section) => {
                                const isActive = currentTime >= section.timestamp &&
                                    currentTime < section.timestamp + (section.duration || 9999);

                                return (
                                    <div
                                        key={section.id}
                                        onClick={() => onTimestampClick(section.timestamp)}
                                        className={`p-4 rounded-xl border transition-all cursor-pointer ${isActive
                                            ? 'border-blue-500 bg-blue-50 shadow-md transform scale-[1.02]'
                                            : 'border-gray-100 bg-gray-50 hover:bg-white hover:border-gray-300'
                                            }`}
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs font-bold text-blue-600 bg-blue-100 px-2 py-1 rounded">
                                                {new Date(section.timestamp * 1000).toISOString().substr(14, 5)}
                                            </span>
                                            {isActive && <span className="text-[10px] font-black text-blue-500 animate-pulse">REPRODUCIENDO</span>}
                                        </div>
                                        <h3 className="font-bold text-gray-800 mb-1">{section.title}</h3>
                                        <p className="text-xs text-gray-500 line-clamp-2">{section.content}</p>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </section>

                {/* Puntos Clave */}
                {summary.keyPoints && summary.keyPoints.length > 0 && (
                    <section className="bg-gradient-to-br from-blue-50 to-indigo-50 p-6 rounded-2xl border border-blue-100">
                        <div className="flex items-center gap-2 mb-3">
                            <FileText className="text-blue-600" size={20} />
                            <h2 className="text-lg font-bold text-blue-900">Puntos Clave</h2>
                        </div>
                        <ul className="space-y-2">
                            {summary.keyPoints.map((point, i) => (
                                <li key={i} className="flex gap-2 text-sm text-blue-800">
                                    <span className="font-bold text-blue-400">•</span>
                                    {point}
                                </li>
                            ))}
                        </ul>
                    </section>
                )}
            </div>

            <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f1f1;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
      `}</style>
        </div>
    );
}
