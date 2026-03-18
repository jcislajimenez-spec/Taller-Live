/**
 * audioService.ts
 * ================
 * Servicio para grabación de audio usando MediaRecorder.
 * Gestiona el ciclo completo: permisos → grabación → blob → base64.
 *
 * Uso:
 *   const recorder = new AudioRecorder();
 *   await recorder.start();
 *   // ... el usuario habla ...
 *   const { blob, base64, durationSeconds } = await recorder.stop();
 */

export interface AudioRecordingResult {
  /** Blob del audio grabado (para subir a Supabase Storage) */
  blob: Blob;
  /** Audio en base64 con prefijo data:audio/webm;base64,... (para enviar a Gemini) */
  base64: string;
  /** Duración de la grabación en segundos */
  durationSeconds: number;
  /** MIME type real usado por MediaRecorder */
  mimeType: string;
}

export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private startTime: number = 0;

  /**
   * Comprueba si el navegador soporta grabación de audio.
   */
  static isSupported(): boolean {
    return !!(
      typeof navigator !== "undefined" &&
      navigator.mediaDevices &&
      navigator.mediaDevices.getUserMedia &&
      typeof MediaRecorder !== "undefined"
    );
  }

  /**
   * Inicia la grabación de audio.
   * Solicita permiso de micrófono al usuario.
   * @throws Error si no hay permiso o el navegador no lo soporta.
   */
  async start(): Promise<void> {
    if (!AudioRecorder.isSupported()) {
      throw new Error("Este navegador no soporta grabación de audio.");
    }

    // Limpiar cualquier grabación previa
    this.cleanup();

    // Pedir permiso y obtener stream de audio
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Elegir el mejor codec disponible
    const mimeType = this.getBestMimeType();
    const options: MediaRecorderOptions = mimeType ? { mimeType } : {};

    this.mediaRecorder = new MediaRecorder(this.stream, options);
    this.audioChunks = [];
    this.startTime = Date.now();

    this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
      if (event.data.size > 0) {
        this.audioChunks.push(event.data);
      }
    };

    // Pedir datos cada segundo para que los chunks se vayan acumulando
    this.mediaRecorder.start(1000);
  }

  /**
   * Detiene la grabación y devuelve el resultado completo.
   * @returns Promesa con blob, base64, duración y mimeType.
   */
  stop(): Promise<AudioRecordingResult> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === "inactive") {
        reject(new Error("No hay grabación activa para detener."));
        return;
      }

      const recorder = this.mediaRecorder;

      recorder.onstop = () => {
        const durationSeconds = Math.round((Date.now() - this.startTime) / 1000);
        const mimeType = recorder.mimeType || "audio/webm";
        const blob = new Blob(this.audioChunks, { type: mimeType });

        if (blob.size < 100) {
          this.cleanup();
          reject(new Error("La grabación es demasiado corta. Inténtalo de nuevo."));
          return;
        }

        // Convertir blob a base64
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result as string;
          this.cleanup();
          resolve({ blob, base64, durationSeconds, mimeType });
        };
        reader.onerror = () => {
          this.cleanup();
          reject(new Error("Error al convertir el audio a base64."));
        };
        reader.readAsDataURL(blob);
      };

      recorder.onerror = () => {
        this.cleanup();
        reject(new Error("Error durante la grabación de audio."));
      };

      // Detener grabación — esto dispara el evento 'onstop'
      recorder.stop();
    });
  }

  /**
   * Indica si hay una grabación en curso.
   */
  get isRecording(): boolean {
    return this.mediaRecorder?.state === "recording";
  }

  /**
   * Limpia todos los recursos (stream, recorder, chunks).
   * Llamar siempre al terminar para liberar el micrófono.
   */
  cleanup(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    this.mediaRecorder = null;
    this.audioChunks = [];
  }

  /**
   * Selecciona el mejor MIME type disponible en este navegador.
   * Prioriza webm/opus (compatible con Gemini).
   */
  private getBestMimeType(): string | undefined {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
    ];
    for (const candidate of candidates) {
      if (MediaRecorder.isTypeSupported(candidate)) {
        return candidate;
      }
    }
    return undefined; // Dejar que el navegador elija
  }
}
