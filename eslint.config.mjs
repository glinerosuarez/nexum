import nextConfig from "eslint-config-next";

export default nextConfig.map((config) => {
  if (config.settings?.react) {
    return {
      ...config,
      settings: {
        ...config.settings,
        react: {
          ...config.settings.react,
          version: "detect",
        },
      },
    };
  }
  return config;
});
