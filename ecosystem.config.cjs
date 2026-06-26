module.exports = {
    apps: [
        {
            name: 'morena-frontend',
            script: './server.mjs',

            env: {
                NODE_ENV: 'production',
                HOST: '0.0.0.0',
                PORT: 3000
            }
        }
    ]
};



