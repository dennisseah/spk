import commander from "commander";
import fs from "fs";
import path from "path";
import { Bedrock, write } from "../../config";
import { build } from "../../lib/commandBuilder";
import {
  generateGitIgnoreFile,
  generateHldLifecyclePipelineYaml
} from "../../lib/fileutils";
import { exec } from "../../lib/shell";
import { logger } from "../../logger";
import { IBedrockFile, IHelmConfig, IMaintainersFile } from "../../types";
import decorator from "./init.decorator.json";

// values that we need to pull out from command operator
interface ICommandOptions {
  defaultRing: string;
}

const execute = async (opts: ICommandOptions) => {
  const { defaultRing } = opts;
  const projectPath = process.cwd();

  try {
    try {
      const _ = Bedrock(); // TOFIX: why do we need to read bedrock file
    } catch (err) {
      logger.info(err);
    }

    await initialize(projectPath, {
      defaultRing
    });
    process.exit(0);
  } catch (err) {
    logger.error(`Error occurred while initializing project ${projectPath}`);
    logger.error(err);
    process.exit(1);
  }
};

export const commandDecorator = (command: commander.Command): void => {
  build(command, decorator).action(execute);
};

/**
 * Initializes the `rootProject` with a bedrock.yaml, maintainers.yaml, and
 * .gitignore
 * If opts.monoRepo == true, the root directly will be initialized as a mono-repo
 * If opts.monoRepo == true, all direct subdirectories under opts.packagesDir will be initialized as individual projects
 *
 * @param rootProjectPath Project root directory which will get initialized
 * @param opts Extra options to pass to initialize
 */
export const initialize = async (
  rootProjectPath: string,
  opts?: {
    defaultRing?: string;
  }
) => {
  const { defaultRing } = opts || {};
  const absProjectRoot = path.resolve(rootProjectPath);
  logger.info(`Initializing project Bedrock project ${absProjectRoot}`);

  // Initialize all paths
  generateBedrockFile(absProjectRoot, [], defaultRing ? [defaultRing] : []);
  await generateMaintainersFile(absProjectRoot, []);
  await generateHldLifecyclePipelineYaml(absProjectRoot);
  generateGitIgnoreFile(absProjectRoot, "spk.log");

  logger.info(`Project initialization complete!`);
};

/**
 * Writes out a default maintainers.yaml file
 *
 * @param projectPath Path to generate the maintainers.yaml file
 * @param packagePaths Array of package paths
 */
const generateMaintainersFile = async (
  projectPath: string,
  packagePaths: string[]
) => {
  const absProjectPath = path.resolve(projectPath);
  const absPackagePaths = packagePaths.map(p => path.resolve(p));
  logger.info(`Generating maintainers.yaml file in ${absProjectPath}`);

  // Get default name/email from git host
  const [gitName, gitEmail] = await Promise.all(
    ["name", "email"].map(async field => {
      try {
        return await exec("git", ["config", `user.${field}`]);
      } catch (_) {
        logger.warn(
          `Unable to parse git.${field} from host. Leaving blank value in maintainers.yaml file`
        );
        return "";
      }
    })
  );

  // Populate maintainers file
  const maintainersFile: IMaintainersFile = absPackagePaths.reduce<
    IMaintainersFile
  >(
    (file, absPackagePath) => {
      const relPathToPackageFromRoot = path.relative(
        absProjectPath,
        absPackagePath
      );
      // Root should use the value from reduce init
      if (relPathToPackageFromRoot !== "") {
        file.services["./" + relPathToPackageFromRoot] = {
          maintainers: [{ email: "", name: "" }]
        };
      }

      return file;
    },
    {
      services: {
        // initialize with the root containing the credentials of the caller
        "./": {
          maintainers: [
            {
              email: gitEmail,
              name: gitName
            }
          ]
        }
      }
    }
  );

  // Check if a maintainer.yaml already exists; skip write if present
  const maintainersFilePath = path.join(absProjectPath, "maintainers.yaml");
  logger.debug(`Writing maintainers.yaml file to ${maintainersFilePath}`);
  if (fs.existsSync(maintainersFilePath)) {
    logger.warn(
      `Existing maintainers.yaml found at ${maintainersFilePath}, skipping generation`
    );
  } else {
    // Write out
    write(maintainersFile, absProjectPath);
  }
};

/**
 * Writes out a default bedrock.yaml
 *
 * @param targetPath Path to generate the the bedrock.yaml file in
 * @param packagePaths Array of package paths
 * @param defaultRings Array of default rings
 */
const generateBedrockFile = (
  projectPath: string,
  packagePaths: string[],
  defaultRings: string[] = []
) => {
  const absProjectPath = path.resolve(projectPath);
  const absPackagePaths = packagePaths.map(p => path.resolve(p));
  logger.info(`Generating bedrock.yaml file in ${absProjectPath}`);

  const basedRingObject: { [ring: string]: { isDefault: boolean } } = {};
  const rings = defaultRings.reduce((defaults, ring) => {
    defaults[ring] = {
      isDefault: true
    };
    return defaults;
  }, basedRingObject);

  const baseBedrockFile: IBedrockFile = {
    rings,
    services: {}
  };

  // Populate bedrock file
  const bedrockFile = absPackagePaths.reduce((file, absPackagePath) => {
    const relPathToPackageFromRoot = path.relative(
      absProjectPath,
      absPackagePath
    );

    const helm: IHelmConfig = {
      chart: {
        branch: "",
        git: "",
        path: ""
      }
    };

    file.services["./" + relPathToPackageFromRoot] = {
      helm
    };
    return file;
  }, baseBedrockFile);

  // Check if a bedrock.yaml already exists; skip write if present
  const bedrockFilePath = path.join(absProjectPath, "bedrock.yaml");
  if (fs.existsSync(bedrockFilePath)) {
    logger.warn(
      `Existing bedrock.yaml found at ${bedrockFilePath}, skipping generation`
    );
  } else {
    // Write out
    write(bedrockFile, absProjectPath);
  }
};
