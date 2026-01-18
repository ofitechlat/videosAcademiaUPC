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
    // 1. Verificar sesión inicial
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setIsAdmin(!!session);
    };
    checkSession();

    // 2. Suscribirse a cambios de autenticación
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
      // Ordenar por fecha: los más nuevos primero
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

  const filteredVideos = useMemo(() => {
    if (!searchQuery.trim()) return videos;
    const q = searchQuery.toLowerCase();
    return videos.filter(v =>
      v.title.toLowerCase().includes(q) ||
      v.summary?.fullSummary?.toLowerCase().includes(q) ||
      v.summary?.keyPoints?.some(kp => kp.toLowerCase().includes(q))
    );
  }, [videos, searchQuery]);

  return (
    <main className="min-h-screen bg-[#0f1113] text-white">
      {/* Navbar Premium */}
      <header className="border-b border-white/5 bg-black/20 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/20">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">IA Video Summary</h1>
          </div>

          <div className="flex items-center gap-4">
            {isAdmin ? (
              <button
                onClick={handleLogout}
                className="text-sm font-medium text-gray-400 hover:text-red-400 transition-colors flex items-center gap-2"
              >
                Cerrar Sesión
              </button>
            ) : (
              <Login onLogin={() => setIsAdmin(true)} />
            )}
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-12">
        {/* Panel de Administración (Privado) */}
        {isAdmin && (
          <section className="mb-20 animate-in fade-in slide-in-from-top-4 duration-1000">
            <div className="mb-8">
              <h2 className="text-3xl font-bold">Administrador</h2>
              <p className="text-gray-400 mt-1">Sube y procesa nuevos videos para la academia</p>
            </div>
            <VideoUploader onComplete={loadVideos} />
          </section>
        )}

        {/* Galería Pública con Buscador */}
        <section>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12">
            <div>
              <h2 className="text-3xl font-bold">Explorar Contenido</h2>
              <p className="text-gray-400 mt-1">Busca temas específicos dentro de los resúmenes</p>
            </div>

            <div className="relative w-full md:w-96 group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <svg className="w-5 h-5 text-gray-500 group-focus-within:text-blue-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Buscar en resúmenes, títulos..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#1a1c1e] border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-[#202225] transition-all shadow-2xl"
              />
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-[#1a1c1e] aspect-video rounded-[2rem] animate-pulse" />
              ))}
            </div>
          ) : filteredVideos.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-20">
              {filteredVideos.map((video) => (
                <div
                  key={video.id}
                  className="group bg-[#16181a] rounded-[2rem] overflow-hidden border border-white/5 hover:border-blue-500/30 transition-all hover:shadow-2xl hover:shadow-blue-600/5 flex flex-col"
                >
                  <div
                    className="aspect-video bg-gray-900 relative cursor-pointer overflow-hidden"
                    onClick={() => router.push(`/watch/${encodeURIComponent(video.id)}`)}
                  >
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity z-10 flex items-center justify-center">
                      <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center scale-90 group-hover:scale-100 transition-transform shadow-xl">
                        <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 20 20"><path d="M4.018 14L14.41 8 4.018 2v12z" /></svg>
                      </div>
                    </div>
                    {/* Placeholder simple */}
                    <div className="absolute inset-0 flex items-center justify-center text-5xl font-black text-white/5 select-none">
                      {video.title.substring(0, 2).toUpperCase()}
                    </div>
                  </div>

                  <div className="p-7 flex-1 flex flex-col">
                    <div className="flex justify-between items-start gap-4 mb-4">
                      <h3
                        className="font-bold text-xl line-clamp-2 leading-snug cursor-pointer hover:text-blue-400 transition-colors"
                        onClick={() => router.push(`/watch/${encodeURIComponent(video.id)}`)}
                      >
                        {video.title}
                      </h3>
                      {isAdmin && (
                        <button
                          onClick={() => handleDelete(video.id)}
                          className="text-gray-600 hover:text-red-500 transition-colors p-1"
                          title="Eliminar"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                        </button>
                      )}
                    </div>

                    <p className="text-gray-400 text-sm line-clamp-3 mb-8 flex-1 leading-relaxed">
                      {video.summary?.fullSummary || "Análisis en proceso o información no disponible."}
                    </p>

                    <button
                      onClick={() => router.push(`/watch/${encodeURIComponent(video.id)}`)}
                      className="w-full py-3.5 bg-white/5 hover:bg-white/10 rounded-2xl text-sm font-bold transition-all border border-white/5 hover:border-blue-500/20"
                    >
                      Ver Resumen Completo
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-24 bg-[#1a1c1e] rounded-[3rem] border border-dashed border-white/5">
              <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold mb-2">No encontramos coincidencias</h3>
              <p className="text-gray-400 max-w-sm mx-auto">Prueba buscando temas generales como "algoritmos", "clase" o por el título del video.</p>
            </div>
          )}
        </section>
      </div>

      <footer className="border-t border-white/5 py-12 text-center text-gray-600 text-sm">
        <p>&copy; 2024 Academia UPC - Todos los derechos reservados.</p>
      </footer>
    </main>
  );
}
