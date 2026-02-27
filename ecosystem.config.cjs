module.exports = {
  apps: [
    {
      name: 'thrustelo-api',
      script: 'dist/server/src/index.mjs',
      interpreter: 'node',
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
        LOG_LEVEL: 'info'
      }
    }
  ]
};
