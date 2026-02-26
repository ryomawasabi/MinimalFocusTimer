class SoundManagerClass {
  async load(): Promise<void> {
    console.log('SoundManager.web: load called (no-op)');
  }

  async playFinish(): Promise<void> {
    console.log('FinishSound: play called (web no-op)');
  }

  async unload(): Promise<void> {
    console.log('SoundManager.web: unload called (no-op)');
  }
}

export const SoundManager = new SoundManagerClass();
