# Deployment Setup

This document explains how to configure GitHub Actions for automatic deployment to your VPS.

## GitHub Secrets Configuration

Go to your GitHub repository settings → Secrets and variables → Actions → New repository secret

Add the following secrets:

### VPS Connection

- `VPS_HOST` - Your VPS IP address or domain
- `VPS_USERNAME` - SSH username (usually `root` or your user)
- `VPS_SSH_KEY` - Your private SSH key (the entire content of your private key file)
- `VPS_PORT` - SSH port (optional, defaults to 22)
- `VPS_APP_PATH` - Path to your app on VPS (optional, defaults to `/var/www/thot_backend`)

### Application Configuration

- `PORT` - Application port (e.g., 3000)
- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - JWT secret key
- `JWT_REFRESH_SECRET` - JWT refresh token secret
- `FRONTEND_URL` - Frontend URL (e.g., https://thot.app)

### AWS S3 Configuration

- `AWS_ACCESS_KEY_ID` - AWS access key
- `AWS_SECRET_ACCESS_KEY` - AWS secret key
- `AWS_REGION` - AWS region (e.g., us-east-1)
- `AWS_S3_BUCKET` - S3 bucket name

### Redis Configuration

- `REDIS_HOST` - Redis host
- `REDIS_PORT` - Redis port (usually 6379)
- `REDIS_PASSWORD` - Redis password

### Email Configuration

- `EMAIL_HOST` - SMTP host
- `EMAIL_PORT` - SMTP port (usually 587 or 465)
- `EMAIL_USER` - SMTP username
- `EMAIL_PASSWORD` - SMTP password

### Error Tracking

- `SENTRY_DSN` - Sentry DSN (optional)

## VPS Setup

### 1. Install Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 2. Install PM2 (Process Manager)

```bash
sudo npm install -g pm2
pm2 startup
```

### 3. Clone Repository

```bash
cd /var/www
git clone git@github.com:Asteerix/thot_backend.git
cd thot_backend
npm install --production
```

### 4. Setup SSH Key for GitHub

Generate SSH key on VPS and add to GitHub deploy keys:

```bash
ssh-keygen -t ed25519 -C "your_email@example.com"
cat ~/.ssh/id_ed25519.pub
```

Add this public key to GitHub: Repository Settings → Deploy keys → Add deploy key

### 5. Configure Firewall

```bash
sudo ufw allow 22
sudo ufw allow 3000
sudo ufw enable
```

## Deployment

### Automatic Deployment

Push to `main` branch triggers automatic deployment:

```bash
git push origin main
```

### Manual Deployment

Trigger manual deployment from GitHub Actions tab:

1. Go to Actions tab
2. Select "Deploy to VPS" workflow
3. Click "Run workflow"

## Process Manager Commands

### PM2

```bash
# Start application
pm2 start src/server.production.js --name thot-backend

# Restart
pm2 restart thot-backend

# Stop
pm2 stop thot-backend

# View logs
pm2 logs thot-backend

# Monitor
pm2 monit
```

### systemd (Alternative)

Create `/etc/systemd/system/thot-backend.service`:

```ini
[Unit]
Description=Thot Backend API
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/thot_backend
ExecStart=/usr/bin/node src/server.production.js
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl enable thot-backend
sudo systemctl start thot-backend
sudo systemctl status thot-backend
```

## Nginx Configuration (Reverse Proxy)

Create `/etc/nginx/sites-available/thot-backend`:

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable and reload:

```bash
sudo ln -s /etc/nginx/sites-available/thot-backend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## SSL Certificate (Let's Encrypt)

```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d api.yourdomain.com
```

## Troubleshooting

### View Deployment Logs

Go to GitHub Actions tab and click on the latest workflow run.

### SSH into VPS

```bash
ssh user@your-vps-ip
cd /var/www/thot_backend
pm2 logs thot-backend
```

### Check Application Health

```bash
curl http://localhost:3000/health
```

### Common Issues

1. **Permission denied** - Check SSH key is correctly added to VPS
2. **Port already in use** - Check if another process is using the port: `sudo lsof -i :3000`
3. **MongoDB connection failed** - Verify MONGODB_URI is correct
4. **Module not found** - Run `npm ci --production` on VPS
