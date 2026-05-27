module.exports = {
  apps: [
    {
      name: 'suredge-daemon',
      script: 'scripts/process-queue.mjs',
      interpreter: 'node',
      // Reinicia automaticamente se o processo travar ou consumir muita memória
      max_memory_restart: '300M',
      // Reinicia até 10 vezes com backoff exponencial (1s, 2s, 4s, 8s...)
      restart_delay: 1000,
      max_restarts: 10,
      exp_backoff_restart_delay: 100,
      // Considera estável após 30s rodando sem cair
      min_uptime: '30s',
      // Logs separados para facilitar debug
      out_file: 'logs/daemon-out.log',
      error_file: 'logs/daemon-err.log',
      merge_logs: false,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      // Passa as variáveis de ambiente do .env
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
