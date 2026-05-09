import fs from "node:fs/promises";
import path from "node:path";

const SETTINGS_FILE = "settings.json";

export async function createSettingsStore(dataDir) {
  await fs.mkdir(dataDir, { recursive: true });
  const settingsPath = path.join(dataDir, SETTINGS_FILE);

  async function readSettings() {
    try {
      const raw = await fs.readFile(settingsPath, "utf8");
      return normalizeSettings(JSON.parse(raw));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      const initial = normalizeSettings({});
      await writeSettings(initial);
      return initial;
    }
  }

  async function writeSettings(settings) {
    const tmpPath = `${settingsPath}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(settings, null, 2), "utf8");
    await fs.rename(tmpPath, settingsPath);
  }

  return {
    async getPublicSettings() {
      const settings = await readSettings();
      return {
        llm: Object.fromEntries(
          Object.entries(settings.llm).map(([providerId, value]) => [
            providerId,
            {
              baseUrl: value.baseUrl || "",
              model: value.model || "",
              hasApiKey: Boolean(value.apiKey),
              updatedAt: value.updatedAt || "",
            },
          ]),
        ),
      };
    },

    async getProviderSettings(providerId) {
      const settings = await readSettings();
      return settings.llm[providerId] || {};
    },

    async upsertProviderSettings(providerId, input) {
      const settings = await readSettings();
      const current = settings.llm[providerId] || {};
      const next = {
        ...current,
        baseUrl: typeof input.baseUrl === "string" ? input.baseUrl.trim() : current.baseUrl || "",
        model: typeof input.model === "string" ? input.model.trim() : current.model || "",
        updatedAt: new Date().toISOString(),
      };

      if (typeof input.apiKey === "string" && input.apiKey.trim()) {
        next.apiKey = input.apiKey.trim();
      }

      if (input.clearApiKey === true) {
        next.apiKey = "";
      }

      settings.llm[providerId] = next;
      await writeSettings(settings);

      return {
        baseUrl: next.baseUrl,
        model: next.model,
        hasApiKey: Boolean(next.apiKey),
        updatedAt: next.updatedAt,
      };
    },
  };
}

function normalizeSettings(settings) {
  return {
    version: 1,
    llm: settings && typeof settings.llm === "object" && settings.llm ? settings.llm : {},
  };
}
