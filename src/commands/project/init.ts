import commander from "commander";
import fs from "fs";
import path from "path";
import shelljs from "shelljs";
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
  await generateBedrockFile(
    absProjectRoot,
    [],
    defaultRing ? [defaultRing] : []
  );
  await generateMaintainersFile(absProjectRoot, []);
  await generateHldLifecyclePipelineYaml(absProjectRoot);
  generateGitIgnoreFile(absProjectRoot, "spk.log");

  logger.info(`Project initialization complete!`);
};

/**
 * Helper function for listing files/dirs in a path
 *
 * @param dir path-like string; what you would pass to ls in bash
 */
const ls = async (dir: string): Promise<string[]> => {
  const lsRet = shelljs.ls(dir);
  if (lsRet.code !== 0) {
    logger.error(lsRet.stderr);
    throw new Error(
      `Error listing files in ${dir}; Ensure this directory exists or specify a different one with the --packages-dir option.`
    );
  }

  // Returned object includes piping functions as well; strings represent the actual output of the function
  const filesAndDirectories = lsRet.filter(out => typeof out === "string");
  return filesAndDirectories;
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
        const gitField = await exec("git", ["config", `user.${field}`]);
        return gitField;
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
const generateBedrockFile = async (
  projectPath: string,
  packagePaths: string[],
  defaultRings: string[] = []
) => {
  const absProjectPath = path.resolve(projectPath);
  const absPackagePaths = packagePaths.map(p => path.resolve(p));
  logger.info(`Generating bedrock.yaml file in ${absProjectPath}`);

  // Populate bedrock file
  const bedrockFile: IBedrockFile = absPackagePaths.reduce<IBedrockFile>(
    (file, absPackagePath) => {
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
    },
    {
      rings: defaultRings.reduce<{ [ring: string]: { isDefault: boolean } }>(
        (defaults, ring) => {
          defaults[ring] = { isDefault: true };
          return defaults;
        },
        {}
      ),
      services: {}
    }
  );

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
