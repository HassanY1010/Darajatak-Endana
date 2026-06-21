// إعدادات PM2 لتشغيل المشروع بشكل دائم على VPS
module.exports = {
  apps: [
    {
      name: 'daragatuk-alayna',
      script: './src/server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    }
  ]
};
