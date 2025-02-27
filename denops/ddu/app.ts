import {
  batch,
  Denops,
  ensureArray,
  ensureObject,
  ensureString,
  vars,
} from "./deps.ts";
import { DduEvent, DduExtType, DduItem, DduOptions } from "./types.ts";
import { Ddu } from "./ddu.ts";
import { ContextBuilder, defaultDduOptions } from "./context.ts";

export async function main(denops: Denops) {
  const ddus: Record<string, Ddu[]> = {};
  const contextBuilder = new ContextBuilder();
  const aliases: Record<DduExtType, Record<string, string>> = {
    ui: {},
    source: {},
    filter: {},
    kind: {},
  };

  const getDdu = (name: string) => {
    if (!ddus[name]) {
      ddus[name] = [];
    }
    if (ddus[name].length == 0) {
      ddus[name].push(new Ddu());
    }
    return ddus[name].slice(-1)[0];
  };
  const pushDdu = (name: string) => {
    if (!ddus[name]) {
      ddus[name] = [];
    }
    ddus[name].push(new Ddu());
    return ddus[name].slice(-1)[0];
  };
  const popDdu = (name: string) => {
    if (!ddus[name]) {
      ddus[name] = [];
    }

    return ddus[name].length == 0 ? null :
      ddus[name].length == 1 ? ddus[name].slice(-1)[0]:
      ddus[name].pop();
  };

  denops.dispatcher = {
    setGlobal(arg1: unknown): Promise<void> {
      const options = ensureObject(arg1);
      contextBuilder.setGlobal(options);
      return Promise.resolve();
    },
    setLocal(arg1: unknown, arg2: unknown): Promise<void> {
      const options = ensureObject(arg1);
      const name = ensureString(arg2);
      contextBuilder.setLocal(name, options);
      return Promise.resolve();
    },
    patchGlobal(arg1: unknown): Promise<void> {
      const options = ensureObject(arg1);
      contextBuilder.patchGlobal(options);
      return Promise.resolve();
    },
    patchLocal(arg1: unknown, arg2: unknown): Promise<void> {
      const options = ensureObject(arg1);
      const name = ensureString(arg2);
      contextBuilder.patchLocal(name, options);
      return Promise.resolve();
    },
    getGlobal(): Promise<Partial<DduOptions>> {
      return Promise.resolve(contextBuilder.getGlobal());
    },
    getLocal(): Promise<Partial<DduOptions>> {
      return Promise.resolve(contextBuilder.getLocal());
    },
    getDefaultOptions(): Promise<Partial<DduOptions>> {
      return Promise.resolve(defaultDduOptions());
    },
    alias(arg1: unknown, arg2: unknown, arg3: unknown): Promise<void> {
      const extType = ensureString(arg1) as DduExtType;
      const alias = ensureString(arg2);
      const base = ensureString(arg3);

      aliases[extType][alias] = base;
      return Promise.resolve();
    },
    async start(arg1: unknown): Promise<void> {
      let userOptions = ensureObject(arg1);
      const [context, options] = await contextBuilder.get(denops, userOptions);

      let ddu = getDdu(options.name);

      if (options.push) {
        const prevDdu = ddu;
        ddu = pushDdu(options.name);
        // Extends previous options
        userOptions = Object.assign(prevDdu.getUserOptions(), userOptions);
      }

      await ddu.start(denops, aliases, context, options, userOptions);
    },
    async redraw(arg1: unknown, arg2: unknown): Promise<void> {
      const name = ensureString(arg1);
      const opt = ensureObject(arg2) as {
        input?: string;
        refreshItems?: boolean;
        updateOptions?: Record<string, unknown>;
      };

      const ddu = getDdu(name);

      if (opt?.input != null) {
        ddu.setInput(opt.input);
      }

      if (opt?.updateOptions) {
        ddu.updateOptions(opt.updateOptions);
      }

      if (
        ddu.getOptions().volatile ||
        opt?.refreshItems || opt?.updateOptions
      ) {
        await ddu.refresh(denops);
      } else {
        await ddu.redraw(denops);
      }
    },
    async event(arg1: unknown, arg2: unknown): Promise<void> {
      const name = ensureString(arg1);
      const event = ensureString(arg2) as DduEvent;

      const ddu = getDdu(name);

      if (event == "close" || event == "cancel") {
        ddu.quit();
      }

      await ddu.onEvent(denops, event);
    },
    async pop(arg1: unknown): Promise<void> {
      const name = ensureString(arg1);

      const currentDdu = popDdu(name);
      if (!currentDdu) {
        return;
      }

      if (ddus[name].length <= 1) {
        // Quit current ddu
        currentDdu.quit();
        await currentDdu.onEvent(denops, "cancel");
        return;
      }

      // Resume previous ddu state
      const userOptions = {
        refresh: true,
        resume: true,
      };
      const [context, options] = await contextBuilder.get(
        denops,
        userOptions,
      );
      const ddu = getDdu(name);
      await ddu.start(denops, aliases, context, options, userOptions);
    },
    async uiAction(
      arg1: unknown,
      arg2: unknown,
      arg3: unknown,
    ): Promise<void> {
      const name = ensureString(arg1);
      const actionName = ensureString(arg2);
      const params = ensureObject(arg3);

      const ddu = getDdu(name);
      await ddu.uiAction(denops, actionName, params);
    },
    async itemAction(
      arg1: unknown,
      arg2: unknown,
      arg3: unknown,
      arg4: unknown,
    ): Promise<void> {
      const name = ensureString(arg1);
      const actionName = ensureString(arg2);
      const items = ensureArray(arg3) as DduItem[];
      const params = ensureObject(arg4);

      const ddu = getDdu(name);
      await ddu.itemAction(denops, actionName, items, params);
    },
    async getItemActions(
      arg1: unknown,
      arg2: unknown,
    ): Promise<string[]> {
      const name = ensureString(arg1);
      const items = ensureArray(arg2) as DduItem[];

      const ddu = getDdu(name);
      const actions = await ddu.getItemActions(denops, items);
      return actions ? Object.keys(actions) : [];
    },
  };

  await batch(denops, async (denops: Denops) => {
    await vars.g.set(denops, "ddu#_initialized", 1);
    await denops.cmd("doautocmd <nomodeline> User DDUReady");
  });
}
