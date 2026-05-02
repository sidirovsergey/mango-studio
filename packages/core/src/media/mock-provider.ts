import type {
  AssetContext,
  ComposeFinalClipInput,
  ConcatMasterInput,
  ExtractLastFrameInput,
  GenerateCharacterDossierInput,
  GenerateFirstFrameInput,
  GenerateSceneVideoInput,
  GenerateVoiceInput,
  JobHandle,
  JobResult,
  JobStatus,
  MediaProvider,
} from './provider';

function mockHandle(model: string, tag: string): JobHandle {
  return {
    fal_request_id: `mock-${tag}`,
    model_used: model,
    request_input: {},
  };
}

function mockResult(url: string): JobResult {
  return { primary_url: url, cost_usd: 0, latency_ms: 1 };
}

export class MockMediaProvider implements MediaProvider {
  async submitCharacterDossier(
    input: GenerateCharacterDossierInput,
    _ctx: AssetContext,
  ): Promise<JobHandle> {
    return mockHandle(input.model, `dossier/${input.model}`);
  }

  async submitFirstFrame(
    input: GenerateFirstFrameInput,
    _ctx: AssetContext,
  ): Promise<JobHandle> {
    return mockHandle(input.model, 'first-frame');
  }

  async submitSceneVideo(
    input: GenerateSceneVideoInput,
    _ctx: AssetContext,
  ): Promise<JobHandle> {
    return mockHandle(input.model, 'scene-video');
  }

  async submitVoice(input: GenerateVoiceInput, _ctx: AssetContext): Promise<JobHandle> {
    return mockHandle(input.tts_provider_model, 'voice');
  }

  async submitFinalClipMux(
    _input: ComposeFinalClipInput,
    _ctx: AssetContext,
  ): Promise<JobHandle> {
    return mockHandle('fal-ai/ffmpeg-api/merge-audio-video', 'mux');
  }

  async submitMasterConcat(_input: ConcatMasterInput, _ctx: AssetContext): Promise<JobHandle> {
    return mockHandle('fal-ai/ffmpeg-api/merge-videos', 'concat');
  }

  async submitLastFrameExtract(
    _input: ExtractLastFrameInput,
    _ctx: AssetContext,
  ): Promise<JobHandle> {
    return mockHandle('fal-ai/ffmpeg-api/extract-frame', 'last-frame');
  }

  async getJobStatus(
    _fal_request_id: string,
    _model: string,
  ): Promise<{ status: JobStatus; error_code?: string }> {
    return { status: 'completed' };
  }

  async getJobResult(_fal_request_id: string, _model: string): Promise<JobResult> {
    return mockResult('https://example.test/mock-result.png');
  }

  async cancelJob(_fal_request_id: string, _model: string): Promise<void> {
    // no-op
  }
}
