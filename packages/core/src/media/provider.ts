import type { AssetContext, StoredAsset } from './storage/StorageProvider';
export type { AssetContext } from './storage/StorageProvider';

export type DossierFormat = '16:9' | '1:1';
export type DossierQuality = '720p' | '1080p' | '2k';

/** All async media operations return a job handle — fal_request_id for polling. */
export interface JobHandle {
  fal_request_id: string;
  model_used: string;
  request_input: Record<string, unknown>;
}

/** Полный результат завершённой fal job — извлекается через fal.queue.result */
export interface JobResult {
  primary_url: string;
  /** Для video — URL последнего кадра, если модель его возвращает */
  last_frame_url?: string;
  cost_usd: number | null;
  latency_ms: number;
}

// === Character dossier (legacy 1.2, теперь async) ===
export interface GenerateCharacterDossierInput {
  prompt: string;
  model: string;
  format: DossierFormat;
  quality: DossierQuality;
  image_refs?: StoredAsset[];
}

// Kept for compatibility with consumers that still reference the old type name.
// Will be removed once Task 12 finishes the character action migration.
export interface GenerateCharacterDossierResult {
  fal_url: string;
  cost_usd: number | null;
  latency_ms: number;
  fal_request_id: string;
  model_used: string;
}

// === Scene first frame (Phase 1.3) ===
export interface GenerateFirstFrameInput {
  prompt: string;
  model: string;
  image_refs?: StoredAsset[];
  aspect_ratio: '9:16';
}

// === Scene video (image-to-video) ===
export interface GenerateSceneVideoInput {
  prompt: string;
  model: string;
  first_frame_ref: StoredAsset;
  duration_sec: number;
  aspect_ratio: '9:16';
}

// === TTS ===
export interface GenerateVoiceInput {
  text: string;
  voice_id: string;
  tts_provider_model: string;
}

// === Video + audio mux ===
export interface ComposeFinalClipInput {
  video_url: string;
  audio_url: string;
}

// === Master concat ===
export interface ConcatMasterInput {
  clip_urls: string[];
}

// === Last frame extraction (when video model didn't return last_frame_url) ===
export interface ExtractLastFrameInput {
  video_url: string;
}

export type JobStatus = 'pending' | 'running' | 'completed' | 'error';

export interface MediaProvider {
  /** Submit a character dossier generation job. Returns handle for polling. */
  submitCharacterDossier(
    input: GenerateCharacterDossierInput,
    ctx: AssetContext,
  ): Promise<JobHandle>;

  /** Submit a scene first-frame image generation job. */
  submitFirstFrame(input: GenerateFirstFrameInput, ctx: AssetContext): Promise<JobHandle>;

  /** Submit a scene video (image-to-video) generation job. */
  submitSceneVideo(input: GenerateSceneVideoInput, ctx: AssetContext): Promise<JobHandle>;

  /** Submit a TTS voice generation job. */
  submitVoice(input: GenerateVoiceInput, ctx: AssetContext): Promise<JobHandle>;

  /** Submit an ffmpeg merge-audio-video job. */
  submitFinalClipMux(input: ComposeFinalClipInput, ctx: AssetContext): Promise<JobHandle>;

  /** Submit an ffmpeg concat job (multiple clips → master). */
  submitMasterConcat(input: ConcatMasterInput, ctx: AssetContext): Promise<JobHandle>;

  /** Submit a last-frame extraction job (used when video model doesn't return last_frame_url). */
  submitLastFrameExtract(input: ExtractLastFrameInput, ctx: AssetContext): Promise<JobHandle>;

  /** Poll status of any submitted job. */
  getJobStatus(
    fal_request_id: string,
    model: string,
  ): Promise<{ status: JobStatus; error_code?: string }>;

  /** Fetch result of a completed job. */
  getJobResult(fal_request_id: string, model: string): Promise<JobResult>;

  /** Cancel an in-flight job. */
  cancelJob(fal_request_id: string, model: string): Promise<void>;
}
