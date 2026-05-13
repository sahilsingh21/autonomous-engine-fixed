module.exports = {
  apps: [{
    name:               'nicheai-engine',
    script:             'server.js',
    instances:          1,
    autorestart:        true,
    watch:              false,
    max_memory_restart: '512M',
    env: {
      NODE_ENV:   'production',
      ENGINE_PORT: 4000,
      AUTOSTART:  'true',
    },
    error_file:     './logs/engine-error.log',
    out_file:       './logs/engine-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    exp_backoff_restart_delay: 100,
    cron_restart: '0 4 * * *',  // Restart at 4am daily to clear memory
  }]
}
