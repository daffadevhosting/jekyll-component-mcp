/**
 * Project-level validation orchestration.
 */

import type { ServerContext } from "../server/context.js";
import { ComponentService } from "./component-service.js";
import { ProjectService } from "./project-service.js";
import { BuildService } from "./build-service.js";
import { validateFrontMatter } from "../parsers/frontmatter-parser.js";
import { safeExists, safeReadFile, safeWalk } from "../utils/filesystem.js";

export interface ProjectValidationResult {
  valid: boolean;
  errors: Array<{ code: string; message: string; file?: string }>;
  warnings: Array<{ code: string; message: string; file?: string }>;
  componentsChecked: number;
  build?: { success: boolean; message?: string };
}

export class ValidationService {
  private components: ComponentService;
  private project: ProjectService;
  private build: BuildService;

  constructor(private readonly ctx: ServerContext) {
    this.components = new ComponentService(ctx);
    this.project = new ProjectService(ctx);
    this.build = new BuildService(ctx);
  }

  async validate(options: { runBuild?: boolean } = {}): Promise<ProjectValidationResult> {
    const errors: ProjectValidationResult["errors"] = [];
    const warnings: ProjectValidationResult["warnings"] = [];

    const info = this.project.getInfo();
    if (!info.jekyll) {
      warnings.push({
        code: "NOT_JEKYLL",
        message: "Project does not look like a Jekyll site (no _config or standard dirs)",
      });
    }

    const scan = this.project.getScan();
    let componentsChecked = 0;
    for (const c of scan.components) {
      componentsChecked += 1;
      const result = this.components.validate(c.name);
      for (const e of result.errors) {
        errors.push({ code: "COMPONENT_ERROR", message: e.message, file: e.file });
      }
      for (const w of result.warnings) {
        warnings.push({ code: "COMPONENT_WARNING", message: w.message, file: w.file });
      }
    }

    // Front matter on markdown under docs
    const root = this.ctx.config.root;
    if (safeExists(root, this.ctx.config.paths.docs)) {
      for (const e of safeWalk(root, this.ctx.config.paths.docs, {
        maxDepth: 4,
        extensions: [".md", ".markdown"],
      })) {
        if (e.isDirectory) continue;
        try {
          const source = safeReadFile(root, e.relativePath, {
            maxSize: this.ctx.config.maxFileSize,
          });
          const fm = validateFrontMatter(source);
          for (const issue of fm.issues) {
            if (issue.level === "error") {
              errors.push({
                code: "FRONTMATTER",
                message: issue.message,
                file: e.relativePath,
              });
            } else {
              warnings.push({
                code: "FRONTMATTER",
                message: issue.message,
                file: e.relativePath,
              });
            }
          }
        } catch {
          /* skip */
        }
      }
    }

    let buildResult: ProjectValidationResult["build"];
    if (options.runBuild) {
      const b = await this.build.build();
      buildResult = {
        success: b.success,
        message: b.success ? "Build succeeded" : b.error?.message ?? "Build failed",
      };
      if (!b.success) {
        errors.push({
          code: "BUILD_FAILED",
          message: buildResult.message ?? "Build failed",
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      componentsChecked,
      build: buildResult,
    };
  }
}
