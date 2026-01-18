from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os
import shutil
import google.generativeai as genai
import imageio_ffmpeg
import subprocess
from pathlib import Path
from pydantic import BaseModel
import json
import time

app = FastAPI()

# Configurar CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configurar Directorios
UPLOAD_DIR = Path("uploads")
PROCESSED_DIR = Path("processed")
UPLOAD_DIR.mkdir(exist_ok=True)
PROCESSED_DIR.mkdir(exist_ok=True)

# Servir archivos procesados estáticos
from fastapi.staticfiles import StaticFiles
app.mount("/static", StaticFiles(directory="processed"), name="static")

# Configuración de Gemini (Busca en entorno o .env.local)
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    try:
        # Intentar buscar en el archivo .env específico que sabemos que existe
        env_path = Path(r"f:\videos\editor ia\clip-js\.env")
        if env_path.exists():
            with open(env_path, "r") as f:
                for line in f:
                    if line.startswith("GEMINI_API_KEY="):
                        GEMINI_API_KEY = line.split("=")[1].strip().strip('"')
                        print("🔑 API Key encontrada en ruta absoluta")
                        break
    except Exception as e:
        print(f"⚠️ Error buscando API Key: {e}")

if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    
    # Debug: Listar modelos disponibles
    print("🤖 Verificando modelos disponibles en Gemini...", flush=True)
    try:
        for m in genai.list_models():
            if 'generateContent' in m.supported_generation_methods:
                print(f"   - {m.name}", flush=True)
    except Exception as e:
        print(f"⚠️ Error listando modelos: {e}", flush=True)


else:
    print("❌ ERROR: No se encontró GEMINI_API_KEY. El backend fallará al transcribir.")


@app.post("/process")
async def process_video(file: UploadFile = File(...)):
    try:
        print(f"🚀 Iniciando procesamiento para: {file.filename}", flush=True)
        
        if not GEMINI_API_KEY:
            error_msg = "Server config error: Missing GEMINI_API_KEY. Check .env file."
            print(f"❌ {error_msg}", flush=True)
            with open("backend_error.log", "w") as f: f.write(error_msg)
            raise HTTPException(status_code=500, detail=error_msg)

        # A. Guardar archivo original
        file_path = UPLOAD_DIR / file.filename
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        print(f"✅ Archivo guardado en: {file_path}", flush=True)

        # Obtener ejecutable de FFmpeg
        ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()

        # B. EXTRACCIÓN DE AUDIO (Paso 1 del usuario)
        print("🔊 Extrayendo audio...", flush=True)
        audio_path = PROCESSED_DIR / f"{file.filename}.mp3"
        subprocess.run([
            ffmpeg_exe, "-i", str(file_path), 
            "-vn", "-ab", "128k", "-y",
            str(audio_path)
        ], check=True)
        print(f"✅ Audio extraído: {audio_path}", flush=True)

        # C. TRANSCRIPCIÓN Y RESUMEN (Paso 2 del usuario)
        print("🧠 Enviando a Gemini para transcripción...", flush=True)
        # UPDATE: Usando Gemini 3 Flash Preview según solicitud del usuario
        model = genai.GenerativeModel('models/gemini-3-flash-preview')
        
        # Subir audio a Gemini File API
        uploaded_file = genai.upload_file(path=str(audio_path), mime_type="audio/mp3")
        
        # Esperar proceso activamente
        while uploaded_file.state.name == "PROCESSING":
            print("⏳ Esperando procesamiento de audio en Google...", flush=True)
            time.sleep(2)
            uploaded_file = genai.get_file(uploaded_file.name)
            
        if uploaded_file.state.name == "FAILED":
            raise ValueError("Google Video Processing failed")

        print("✨ Audio listo en Gemini. Transcribiendo...", flush=True)
        
        prompt_transcribe = """
        ACT AS A PROFESSIONAL TRANSCRIBER. 
        TASK: Transcribe the audio verbatim. 
        LANGUAGE: Spanish (Español).
        OUTPUT FORMAT: JSON with "text" (full text) and "segments" (start, end, text).
        """
        
        result_transcription = model.generate_content(
            [prompt_transcribe, uploaded_file],
            generation_config={"response_mime_type": "application/json"}
        )
        
        # Limpiar respuesta JSON (quitar backticks de markdown)
        def clean_json_text(text):
            text = text.strip()
            if text.startswith("```json"):
                text = text[7:]
            if text.startswith("```"):
                text = text[3:]
            if text.endswith("```"):
                text = text[:-3]
            return text.strip()

        raw_transcription = result_transcription.text
        # print(f"📝 Raw Transcription Response: {raw_transcription[:100]}...", flush=True)
        
        try:
            transcription_data = json.loads(clean_json_text(raw_transcription))
            
            # FLEXIBILIDAD: Si es una lista, convertirla al formato esperado
            if isinstance(transcription_data, list):
                print("💡 Gemini devolvió una LISTA de segmentos. Ajustando formato...", flush=True)
                transcription_data = {
                    "text": " ".join([s.get("text", "") for s in transcription_data]),
                    "segments": transcription_data
                }

            seg_count = len(transcription_data.get('segments', []))
            print(f"✅ Transcripción completada ({seg_count} segmentos)", flush=True)
        except json.JSONDecodeError as e:
            print(f"❌ Error parseando JSON de transcripción: {e}", flush=True)
            # print(f"Contenido problemático: {raw_transcription}", flush=True)
            raise e
        except Exception as e:
            print(f"❌ Error procesando datos de transcripción: {e}", flush=True)
            raise e

        # Generar Resumen
        print("📚 Generando resumen estructurado (En Español)...", flush=True)
        prompt_summary = """
        ACT AS AN EXPERT EDUCATIONAL VIDEO ANALYST.
        
        TASK: Create a structured summary of the provided video/audio.
        LANGUAGE: SPANISH (Español). ALL content (titles, text, key points) MUST be in Spanish.
        
        STRUCTURE REQUIREMENTS:
        1. "summary": A comprehensive executive summary in Spanish.
        2. "sections": Break down the video into logical sections.
           - "title": Concise section title in Spanish.
           - "start": EXACT timestamp in TOTAL SECONDS (float). 
             * EXAMPLE: "1 minute 30 seconds" -> 90.0 (NOT 1.30, NOT 1.5).
             * EXAMPLE: "5 minutes" -> 300.0 (NOT 5.0).
           - "content": Detailed explanation of the section in Spanish.
        3. "keyPoints": List of 3-5 key takeaways in Spanish.

        Output JSON format:
        {
            "summary": "Resumen ejecutivo completo...",
            "sections": [
                {"title": "Título de la Sección", "start": 0.0, "content": "Explicación detallada..."}
            ],
            "keyPoints": ["Punto clave 1", "Punto clave 2"]
        }
        """
        result_summary = model.generate_content(
            [prompt_summary, uploaded_file],
            generation_config={"response_mime_type": "application/json"}
        )
        
        raw_summary = result_summary.text
        try:
            summary_data = json.loads(clean_json_text(raw_summary))
            print("✅ Resumen generado exitosamente", flush=True)
        except json.JSONDecodeError as e:
            print(f"❌ Error parseando JSON de resumen: {e}", flush=True)
            # print(f"Contenido problemático: {raw_summary}", flush=True)
            raise e

        print("✅ Resumen completado", flush=True)

        # D. COMPRESIÓN DE VIDEO (Paso 3 del usuario)
        # Solo después de tener los datos de IA exitosos, comprimimos el video visual
        print("📉 Comprimiendo video para web (720p)...", flush=True)
        compressed_filename = f"compressed_{file.filename}"
        compressed_path = PROCESSED_DIR / compressed_filename
        
        subprocess.run([
            ffmpeg_exe, "-i", str(file_path),
            "-vf", "scale=-2:720", 
            "-c:v", "libx264", "-crf", "28", "-preset", "veryfast",
            "-c:a", "aac", "-b:a", "128k", "-y",
            str(compressed_path)
        ], check=True)
        print(f"✅ Video comprimido listo: {compressed_path}", flush=True)

        # Respuesta Final
        return {
            "status": "success",
            "videoId": file.filename,
            "title": file.filename,
            "videoUrl": f"/static/{compressed_filename}",
            "transcription": transcription_data,
            "summary": summary_data
        }

    except Exception as e:
        import traceback
        error_msg = traceback.format_exc()
        print(f"❌ CRITICAL ERROR: {error_msg}", flush=True)
        
        # ESCRIBIR ERROR EN UN ARCHIVO PARA LEERLO
        with open("backend_error.log", "w", encoding="utf-8") as f:
            f.write(error_msg)
            
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    print("🔋 Iniciando servidor backend en puerto 8000...", flush=True)
    uvicorn.run(app, host="0.0.0.0", port=8000)
