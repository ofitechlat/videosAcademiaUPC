import { supabase } from './supabase';
import { VideoData } from '../types';

// ==========================================
// ☁️ SUPABASE IMPLEMENTATION
// ==========================================

export async function saveVideo(video: VideoData, blob: Blob): Promise<void> {
    try {
        console.log('☁️ Uploading video to Supabase Storage...', video.id);

        // 1. Upload Blob to Storage
        const fileExt = 'mp4'; // Assuming mp4 for consistency, or extract from blob.type
        const filePath = `${video.id}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
            .from('videos')
            .upload(filePath, blob, {
                cacheControl: '3600',
                upsert: true
            });

        if (uploadError) throw uploadError;

        // 2. Insert Metadata to DB
        console.log('☁️ Saving metadata to Supabase DB...', video.id);
        const { error: dbError } = await supabase
            .from('videos')
            .insert({
                id: video.id,
                title: video.title,
                duration: video.duration,
                thumbnail: video.thumbnail,
                compressed_size: video.compressedSize,
                original_size: video.originalSize,
                transcription: video.transcription,  // Auto-converted to JSONB
                summary: video.summary,              // Auto-converted to JSONB
                created_at: new Date().toISOString()
            });

        if (dbError) throw dbError;

        console.log('✅ Video saved successfully to Supabase!');

    } catch (error) {
        console.error('❌ Error saving to Supabase:', error);
        throw error;
    }
}

export async function getVideo(id: string): Promise<{ video: VideoData; blob: Blob } | null> {
    try {
        // 1. Get Metadata
        const { data: videoRecord, error: dbError } = await supabase
            .from('videos')
            .select('*')
            .eq('id', id)
            .single();

        if (dbError || !videoRecord) {
            console.warn('⚠️ Video not found in DB:', id);
            return null;
        }

        // 2. Download Blob from Storage (to maintain compatibility with current app flow)
        // Note: For production, streaming the URL is better, but this keeps the refactor minimal.
        const fileExt = 'mp4';
        const filePath = `${id}.${fileExt}`;

        const { data: blobData, error: downloadError } = await supabase.storage
            .from('videos')
            .download(filePath);

        if (downloadError || !blobData) {
            console.warn('⚠️ Video file not found in Storage:', id);
            return null;
        }

        // Map snake_case (DB) to camelCase (Frontend Interface)
        const video: VideoData = {
            id: videoRecord.id,
            title: videoRecord.title,
            duration: videoRecord.duration,
            thumbnail: videoRecord.thumbnail,
            compressedSize: videoRecord.compressed_size,
            originalSize: videoRecord.original_size,
            transcription: videoRecord.transcription,
            summary: videoRecord.summary,
            createdAt: videoRecord.created_at
        };

        return { video, blob: blobData };

    } catch (error) {
        console.error('❌ Error getting video from Supabase:', error);
        return null;
    }
}

export async function listVideos(): Promise<VideoData[]> {
    const { data, error } = await supabase
        .from('videos')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('❌ Error listing videos:', error);
        return [];
    }

    // Map DB results to Frontend Interface
    return data.map((record: any) => ({
        id: record.id,
        title: record.title,
        duration: record.duration,
        thumbnail: record.thumbnail,
        compressedSize: record.compressed_size,
        originalSize: record.original_size,
        transcription: record.transcription,
        summary: record.summary,
        createdAt: record.created_at
    }));
}

export async function deleteVideo(id: string): Promise<void> {
    try {
        // 1. Delete from DB
        const { error: dbError } = await supabase
            .from('videos')
            .delete()
            .eq('id', id);

        if (dbError) throw dbError;

        // 2. Delete from Storage
        const fileExt = 'mp4';
        const filePath = `${id}.${fileExt}`;

        const { error: storageError } = await supabase.storage
            .from('videos')
            .remove([filePath]);

        if (storageError) throw storageError;

        console.log('🗑️ Video deleted from Supabase:', id);

    } catch (error) {
        console.error('❌ Error deleting video:', error);
        throw error;
    }
}

export async function getVideoBlob(id: string): Promise<Blob | null> {
    // Helper used in certain contexts
    const fileExt = 'mp4';
    const filePath = `${id}.${fileExt}`;
    const { data, error } = await supabase.storage
        .from('videos')
        .download(filePath);

    if (error) return null;
    return data;
}
