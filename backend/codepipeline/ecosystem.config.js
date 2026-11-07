module.exports = {
  apps: [
    {
      name: 'orot-affiliate-backend',
      script: './dist/main.js',
      cwd: '/home/ubuntu/orot-affiliate/backend',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        NODE_OPTIONS: '--max-old-space-size=640',
        PORT: process.env.PORT,
      },
      env_file: '/home/ubuntu/orot-affiliate/backend/.env.production',
      error_file: '/home/ubuntu/.pm2/logs/orot-affiliate-backend-error.log',
      out_file: '/home/ubuntu/.pm2/logs/orot-affiliate-backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      node_args: '-r dotenv/config',
    },
  ],
};
