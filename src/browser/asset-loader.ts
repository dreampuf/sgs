import imageAssetPaths from "virtual:sgs-image-assets";

export type AssetLoadPhase =
  | "idle"
  | "interface"
  | "standard"
  | "expansion"
  | "audio-catalogs"
  | "complete";

export interface AssetLoadSnapshot {
  phase: AssetLoadPhase;
  loaded: number;
  failed: number;
  total: number;
  totalImages: number;
  complete: boolean;
  failedUrls: string[];
}

export interface SgsAssetLoader {
  start(): Promise<AssetLoadSnapshot>;
  snapshot(): AssetLoadSnapshot;
}

interface AssetLoaderOptions {
  whenAudioCatalogReady(): Promise<void>;
}

const AUDIO_CATALOG_COUNT = 2;
const IMAGE_CONCURRENCY = 12;

function runtimeAssetUrl(path: string): string {
  if (/^[a-z][a-z\d+.-]*:/i.test(path)) return path;
  return new URL(path.replace(/^\/+/, ""), document.baseURI).href;
}

function uniqueSorted(paths: readonly string[]): string[] {
  return [...new Set(paths)].sort();
}

function phaseForImage(path: string): Exclude<
  AssetLoadPhase,
  "idle" | "audio-catalogs" | "complete"
> {
  if (path.startsWith("img/system/")) return "interface";
  if (path.startsWith("img/expansion/")) return "expansion";
  return "standard";
}

const PHASE_LABELS: Record<AssetLoadPhase, string> = {
  idle: "准备资源清单",
  interface: "加载界面素材",
  standard: "加载标准牌局素材",
  expansion: "加载扩展包素材",
  "audio-catalogs": "校验音频目录",
  complete: "资源加载完成"
};

class BrowserAssetLoader implements SgsAssetLoader {
  readonly #options: AssetLoaderOptions;
  readonly #images = uniqueSorted(imageAssetPaths);
  readonly #failedUrls: string[] = [];
  #phase: AssetLoadPhase = "idle";
  #loaded = 0;
  #failed = 0;
  #complete = false;
  #promise: Promise<AssetLoadSnapshot> | null = null;

  constructor(options: AssetLoaderOptions) {
    this.#options = options;
  }

  start(): Promise<AssetLoadSnapshot> {
    this.#promise ??= this.#load();
    return this.#promise;
  }

  snapshot(): AssetLoadSnapshot {
    return {
      phase: this.#phase,
      loaded: this.#loaded,
      failed: this.#failed,
      total: this.#images.length + AUDIO_CATALOG_COUNT,
      totalImages: this.#images.length,
      complete: this.#complete,
      failedUrls: [...this.#failedUrls]
    };
  }

  async #load(): Promise<AssetLoadSnapshot> {
    this.#showLoadingScreen();
    const phases = ["interface", "standard", "expansion"] as const;
    for (const phase of phases) {
      this.#phase = phase;
      this.#render();
      await this.#loadImages(
        this.#images.filter((path) => phaseForImage(path) === phase)
      );
    }

    this.#phase = "audio-catalogs";
    this.#render();
    try {
      await this.#options.whenAudioCatalogReady();
      this.#loaded += AUDIO_CATALOG_COUNT;
    } catch (error) {
      this.#failed += AUDIO_CATALOG_COUNT;
      this.#failedUrls.push("audio/catalog.json", "audio/heroes/catalog.json");
      console.warn("Unable to load audio catalogs during startup", error);
    }

    this.#phase = "complete";
    this.#render();
    await new Promise<void>((resolve) => window.setTimeout(resolve, 180));
    this.#hideLoadingScreen();
    this.#complete = true;
    return this.snapshot();
  }

  async #loadImages(paths: readonly string[]): Promise<void> {
    let nextIndex = 0;
    const worker = async () => {
      while (nextIndex < paths.length) {
        const path = paths[nextIndex++];
        if (!path) continue;
        const loaded = await this.#loadImage(path);
        if (loaded) {
          this.#loaded += 1;
        } else {
          this.#failed += 1;
          this.#failedUrls.push(path);
        }
        this.#render();
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.min(IMAGE_CONCURRENCY, Math.max(1, paths.length)) },
        worker
      )
    );
  }

  #loadImage(path: string): Promise<boolean> {
    return new Promise((resolve) => {
      const image = new Image();
      let settled = false;
      const finish = (loaded: boolean) => {
        if (settled) return;
        settled = true;
        image.onload = null;
        image.onerror = null;
        resolve(loaded);
      };
      image.onload = () => finish(true);
      image.onerror = () => finish(false);
      image.src = runtimeAssetUrl(path);
      if (image.complete) {
        queueMicrotask(() => finish(image.naturalWidth > 0));
      }
    });
  }

  #showLoadingScreen(): void {
    const main = document.querySelector<HTMLElement>("#main");
    const loading = document.querySelector<HTMLElement>("#data_load");
    if (main) main.style.display = "block";
    if (loading) {
      loading.style.display = "block";
      loading.setAttribute("aria-busy", "true");
    }
    this.#render();
  }

  #hideLoadingScreen(): void {
    const loading = document.querySelector<HTMLElement>("#data_load");
    if (!loading) return;
    loading.setAttribute("aria-busy", "false");
    loading.style.display = "none";
  }

  #render(): void {
    const total = this.#images.length + AUDIO_CATALOG_COUNT;
    const finished = this.#loaded + this.#failed;
    const percentage = total === 0
      ? 100
      : Math.floor(finished / total * 100);
    const percentageElement = document.querySelector<HTMLElement>(
      "#data_load_perc"
    );
    const phaseElement = document.querySelector<HTMLElement>(
      "#data_load_phase"
    );
    const detailElement = document.querySelector<HTMLElement>(
      "#data_load_detail"
    );
    const barElement = document.querySelector<HTMLElement>("#data_load_bar i");
    if (percentageElement) percentageElement.textContent = `${percentage}%`;
    if (phaseElement) phaseElement.textContent = PHASE_LABELS[this.#phase];
    if (detailElement) {
      detailElement.textContent = this.#failed > 0
        ? `${finished} / ${total} · ${this.#failed} 项加载失败`
        : `${finished} / ${total}`;
    }
    if (barElement) barElement.style.width = `${percentage}%`;
  }
}

export function createAssetLoader(
  options: AssetLoaderOptions
): SgsAssetLoader {
  return new BrowserAssetLoader(options);
}
