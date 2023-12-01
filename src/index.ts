import chalk from "chalk";
import path from "path";
import { ModuleNode, files, docker } from "zksync-cli/lib";

import type { ConfigHandler } from "zksync-cli/lib";

type ModuleConfig = {
  version?: string;
};

let latestVersion: string | undefined;

const REPO_URL = "matter-labs/era-test-node";

export default class SetupModule extends ModuleNode<ModuleConfig> {
  constructor(config: ConfigHandler) {
    super(
      {
        name: "In memory node",
        description: "Quick startup, no persisted state, only L2 node",
      },
      config
    );
  }

  composeFile = path.join(files.getDirPath(import.meta.url), "../docker-compose.yml");

  get nodeInfo() {
    return {
      l2: {
        chainId: 260,
        rpcUrl: "http://127.0.0.1:8011",
      },
    };
  }

  async isInstalled() {
    return (await docker.compose.status(this.composeFile)).length ? true : false;
  }
  async install() {
    const latestVersion = (await this.getLatestVersion())!;
    await docker.compose.build(this.composeFile, undefined, [`--build-arg LATEST_RELEASE=${latestVersion}`]);
    this.setModuleConfig({
      ...this.moduleConfig,
      version: latestVersion,
    });
    await docker.compose.create(this.composeFile);
  }

  async isRunning() {
    return (await docker.compose.status(this.composeFile)).some(({ isRunning }) => isRunning);
  }
  async start() {
    await docker.compose.up(this.composeFile);
  }
  getStartupInfo() {
    return [
      {
        text: "zkSync Node (L2):",
        list: [
          `Chain ID: ${this.nodeInfo.l2.chainId}`,
          `RPC URL: ${this.nodeInfo.l2.rpcUrl}`,
          "Rich accounts: https://era.zksync.io/docs/tools/testing/era-test-node.html#use-pre-configured-rich-wallets",
        ],
      },
      chalk.yellow("Note: every restart will necessitate a reset of MetaMask's cached account data"),
    ];
  }

  async getLogs() {
    return await docker.compose.logs(this.composeFile);
  }

  get version() {
    return this.moduleConfig.version?.toString() ?? undefined;
  }
  async getLatestVersion(): Promise<string> {
    if (latestVersion) {
      return latestVersion;
    }
    const apiUrl = `https://api.github.com/repos/${REPO_URL}/releases/latest`;
    try {
      const response = await fetch(apiUrl);
      if (!response.ok) {
        throw new Error(`GitHub API request failed with status: ${response.status}`);
      }
      const releaseInfo = await response.json();
      if (typeof releaseInfo?.tag_name !== "string") {
        throw new Error(`Failed to parse the latest release version: ${JSON.stringify(releaseInfo)}`);
      }
      latestVersion = releaseInfo.tag_name;
      return latestVersion!;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch the latest release version: ${error.message}`);
      }
      throw error;
    }
  }
  async update() {
    await this.clean();
    await this.install();
  }

  async stop() {
    await docker.compose.stop(this.composeFile);
  }

  async clean() {
    await docker.compose.down(this.composeFile);
  }
}
