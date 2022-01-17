import {
  ActionFlags,
  BaseUi,
  DduItem,
  DduOptions,
  UiOptions,
} from "../ddu/types.ts";
import { Denops, fn } from "../ddu/deps.ts";
import { ActionArguments } from "../ddu/base/ui.ts";

type DoActionParams = {
  name?: string;
  params?: unknown;
};

type Params = Record<never, never>;

export class Ui extends BaseUi<Params> {
  private items: DduItem[] = [];
  private selectedItems: Set<number> = new Set();

  refreshItems(args: {
    items: DduItem[];
  }): void {
    // Note: Use only 1000 items
    this.items = args.items.slice(0, 1000);
    this.selectedItems.clear();
  }

  async redraw(args: {
    denops: Denops;
    options: DduOptions;
    uiOptions: UiOptions;
    uiParams: Params;
  }): Promise<void> {
    const bufferName = `ddu-std-${args.options.name}`;
    let bufnr;
    if (await fn.bufexists(args.denops, bufferName)) {
      bufnr = await fn.bufnr(args.denops, bufferName);
    } else {
      // Initialize buffer
      bufnr = await this.initBuffer(args.denops, bufferName);
    }

    await fn.setbufvar(args.denops, bufnr, "&modifiable", 1);

    const ids = await fn.win_findbuf(args.denops, bufnr) as number[];
    if (ids.length == 0) {
      await args.denops.cmd(`buffer ${bufnr}`);
    }

    // Update main buffer
    await args.denops.call(
      "ddu#ui#std#update_buffer",
      bufnr,
      this.items.map(
        (c, i) => `${this.selectedItems.has(i) ? "*" : " "}${c.word}`,
      ),
    );

    await fn.setbufvar(args.denops, bufnr, "ddu_ui_name", args.options.name);

    // Open filter window
    await args.denops.call(
      "ddu#ui#std#filter#_open",
      args.options.name,
      args.options.input,
    );
  }

  actions: Record<
    string,
    (args: ActionArguments<Params>) => Promise<ActionFlags>
  > = {
    doAction: async (args: {
      denops: Denops;
      options: DduOptions;
      actionParams: unknown;
    }) => {
      const idx = (await fn.line(args.denops, ".")) - 1;
      const item = this.items[idx];
      const params = args.actionParams as DoActionParams;
      await args.denops.call(
        "ddu#do_action",
        args.options.name,
        params.name ?? "default",
        [item],
        params.params ?? {},
      );

      return Promise.resolve(ActionFlags.None);
    },
    toggleSelectItem: async (args: {
      denops: Denops;
      options: DduOptions;
      actionParams: unknown;
    }) => {
      const idx = (await fn.line(args.denops, ".")) - 1;
      if (this.selectedItems.has(idx)) {
        this.selectedItems.delete(idx);
      } else {
        this.selectedItems.add(idx);
      }

      return Promise.resolve(ActionFlags.Redraw);
    },
  };

  params(): Params {
    return {};
  }

  private async initBuffer(
    denops: Denops,
    bufferName: string,
  ): Promise<number> {
    const bufnr = await fn.bufadd(denops, bufferName);
    await fn.bufload(denops, bufnr);

    denops.cmd(
      `syntax match deniteSelectedLine /^[*].*/` +
        " contains=deniteConcealedMark",
    );
    denops.cmd(
      `syntax match deniteConcealedMark /^[ *]/` +
        " conceal contained",
    );
    await fn.setbufvar(denops, bufnr, "&filetype", "ddu-std");

    return Promise.resolve(bufnr);
  }
}
