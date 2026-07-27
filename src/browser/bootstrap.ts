import { CoreBoutAdapter } from "./core-bout-adapter";

declare global {
  interface Window {
    sgsCore?: {
      createBout(
        players: ConstructorParameters<typeof CoreBoutAdapter>[0],
        aiLevel: number
      ): CoreBoutAdapter;
    };
  }
}

window.sgsCore = {
  createBout: (players, aiLevel) => {
    const legacy = window as unknown as {
      sgs: { func: { get_random_seed(): number | null } };
    };
    const configuredSeed = legacy.sgs.func.get_random_seed();
    return new CoreBoutAdapter(
      players,
      aiLevel,
      configuredSeed ?? Date.now()
    );
  }
};
