import { WorkspaceShimService } from "../shims/workspace";
import { TSLspConverter } from "../utils/converter";
import { createCommandsConverter } from "./commandsConverter";

export let commandsConverter: ReturnType<typeof createCommandsConverter>;

export function initializeShareMod(
  converter: TSLspConverter,
  workspaceService: WorkspaceShimService
) {
  commandsConverter = createCommandsConverter(converter, workspaceService);

  return { commandsConverter };
}
