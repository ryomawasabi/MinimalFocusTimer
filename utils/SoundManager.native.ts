import { Audio } from 'expo-av';

class SoundManagerClass {
  private finishSound: Audio.Sound | null = null;
  private isLoaded: boolean = false;
  private isPlaying: boolean = false;

  async load(): Promise<void> {
    if (this.isLoaded) return;

    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });

      const { sound } = await Audio.Sound.createAsync(
        require('../assets/sounds/finish.mp3')
      );
      this.finishSound = sound;
      this.isLoaded = true;
    } catch {
      this.isLoaded = false;
    }
  }

  async playFinish(): Promise<void> {
    console.log('FinishSound: play called');
    if (!this.isLoaded || !this.finishSound || this.isPlaying) {
      console.log('FinishSound: play skipped', { isLoaded: this.isLoaded, hasSound: !!this.finishSound, isPlaying: this.isPlaying });
      return;
    }

    try {
      this.isPlaying = true;
      await this.finishSound.setPositionAsync(0);
      await this.finishSound.playAsync();
      console.log('FinishSound: play success');

      this.finishSound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && !status.isPlaying) {
          this.isPlaying = false;
        }
      });
    } catch (error) {
      console.log('FinishSound: play error', error);
      this.isPlaying = false;
    }
  }

  async unload(): Promise<void> {
    if (this.finishSound) {
      try {
        await this.finishSound.unloadAsync();
      } catch {
      }
      this.finishSound = null;
      this.isLoaded = false;
      this.isPlaying = false;
    }
  }
}

export const SoundManager = new SoundManagerClass();
