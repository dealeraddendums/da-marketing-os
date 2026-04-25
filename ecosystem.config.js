module.exports = {
  apps: [{
    name:   'da-marketing',
    script: 'node_modules/.bin/next',
    args:   'start -p 3020',
    cwd:    '/home/ubuntu/da-marketing-os',
    env: {
      NODE_ENV: 'production',
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file:  './logs/err.log',
    out_file:    './logs/out.log',
    merge_logs:  true,
    max_restarts: 5,
    restart_delay: 3000,
  }],
}
