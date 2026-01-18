"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import VideoUploader from "./components/VideoUploader";
import { listVideos, deleteVideo } from "./utils/storage";
import { VideoData } from "./types";
import Login from "./components/Login";
import { supabase } from "./utils/supabase";

export default function Home() {
  const [videos, setVideos] = useState<VideoData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const router = useRouter();

  useEffect(() => {
    // Verificar sesión al cargar
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAdmin(!!session);
    });

    // Suscribirse a cambios de auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAdmin(!!session);
    });

    loadVideos();

    return () => subscription.unsubscribe();
  }, []);

  async function loadVideos() {
    try {
      setLoading(true);
      const data = await listVideos();
      // Ordenar por fecha de creación descendente (asumiendo que los IDs o el orden de Supabase puede variar)
      setVideos(data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    } catch (err) {
      console.error("Error cargando videos:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!isAdmin) return;
    if (confirm("¿Estás seguro de que quieres eliminar este video?")) {
      await deleteVideo(id);
      loadVideos();
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setIsAdmin(false);
  }

  // Lógica del Buscador
  const filteredVideos = useMemo(() => {
    if (!searchQuery.trim()) return videos;

    const query = searchQuery.toLowerCase();
    return videos.filter(video => {
      const matchTitle = video.title.toLowerCase().includes(query);
      const matchSummary = video.summary?.fullSummary?.toLowerCase().includes(query);
      const matchKeyPoints = video.summary?.keyPoints?.some(p => p.toLowerCase().includes(query));
      const matchSections = video.summary?.sections?.some(s =>
        s.title.toLowerCase().includes(query) || s.content.toLowerCase().includes(query)
      );

      return matchTitle || matchSummary || matchKeyPoints || matchSections;
    });
  }, [videos, searchQuery]);

  return (
    <main className="min-h-screen bg-[#0f1113] text-white">
      {/* Navbar / Header */}
      <header className="border-b border-white/5 bg-black/20 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/20">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">IA Video Summary</h1>
          </div>

          <div className="flex items-center gap-6">
            {isAdmin ? (
              <button
                onClick={handleLogout}
                className="text-sm text-gray-400 hover:text-red-400 transition-colors flex items-center gap-2"
              >
                Cerrar Sesión (Admin)
              </button>
            ) : (
              <Login onLogin={() => setIsAdmin(true)} />
            )}
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-12">
        {/* Admin Section: Uploader */}
        {isAdmin && (
          <section className="mb-16 animate-in fade-in slide-in-from-top-4 duration-700">
            <div className="flex justify-between items-end mb-6">
              <div>
                <h2 className="text-3xl font-bold">Panel de Administración</h2>
                <p className="text-gray-400 mt-1">Sube nuevos videos para procesar con IA</p>
              </div>
            </div>
            <VideoUploader onComplete={loadVideos} />
          </section>
        )}

        {/* Public Section: Gallery & Search */}
        <section>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
            <div>
              <h2 className="text-3xl font-bold">Explorar Videos</h2>
              <p className="text-gray-400 mt-1">Resúmenes inteligentes generados por IA</p>
            </div>

            {/* Buscador */}
            <div className="relative w-full md:w-96 group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <svg className="w-5 h-5 text-gray-500 group-focus-within:text-blue-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Buscar temas, palabras clave..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#1a1c1e] border border-white/10 rounded-2xl py-3.5 pl-12 pr-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-[#202225] transition-all shadow-xl"
              />
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-[#1a1c1e] aspect-video rounded-3xl animate-pulse" />
              ))}
            </div>
          ) : filteredVideos.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
              {filteredVideos.map((video) => (
                <div
                  key={video.id}
                  className="group bg-[#1a1c1e] rounded-3xl overflow-hidden border border-white/5 hover:border-blue-500/30 transition-all hover:shadow-2xl hover:shadow-blue-900/10 flex flex-col"
                >
                  <div
                    className="aspect-video bg-gray-900 relative cursor-pointer overflow-hidden"
                    onClick={() => router.push(`/watch/${encodeURIComponent(video.id)}`)}
                  >
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity z-10 flex items-center justify-center">
                      <div className="w-14 h-14 bg-blue-600 rounded-full flex items-center justify-center scale-75 group-hover:scale-100 transition-transform">
                        <svg className="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 20 20"><path d="M4.018 14L14.41 8 4.018 2v12z" /></svg>
                      </div>
                    </div>
                    {/* Placeholder de Thumbnail con iniciales */}
                    <div className="absolute inset-0 flex items-center justify-center text-4xl text-white/5 font-bold">
                      {video.title.substring(0, 2).toUpperCase()}
                    </div>
                  </div>

                  <div className="p-6 flex-1 flex flex-col">
                    <div className="flex justify-between items-start gap-4 mb-3">
                      <h3
                        className="font-bold text-lg line-clamp-2 cursor-pointer hover:text-blue-400 transition-colors"
                        onClick={() => router.push(`/watch/${encodeURIComponent(video.id)}`)}
                      >
                        {video.title}
                      </h3>
                      {isAdmin && (
                        <button
                          onClick={() => handleDelete(video.id)}
                          className="text-gray-500 hover:text-red-500 transition-colors p-1"
                          title="Eliminar"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
                        </button>
                      )}
                    </div>

                    <p className="text-gray-400 text-sm line-clamp-3 mb-6 flex-1 leading-relaxed">
                      {video.summary?.fullSummary || "Sin resumen disponible."}
                    </p>

                    <button
                      onClick={() => router.push(`/watch/${encodeURIComponent(video.id)}`)}
                      className="w-full py-3 bg-white/5 hover:bg-white/10 rounded-2xl text-sm font-semibold transition-all border border-white/5 hover:border-white/10"
                    >
                      Ver Análisis
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-24 bg-[#1a1c1e] rounded-3xl border border-dashed border-white/10">
              <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </div>
              <h3 className="text-xl font-bold mb-2">No se encontraron resultados</h3>
              <p className="text-gray-400">Intenta con otras palabras clave.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
