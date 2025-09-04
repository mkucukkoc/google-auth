# Deployment Guide

Bu doküman, ChatGBT Mini backend authentication sisteminin production ortamına deployment'ı için detaylı adımları içerir.

## 🏗️ Infrastructure Requirements

### Minimum Requirements
- **CPU**: 2 vCPU
- **RAM**: 4GB
- **Storage**: 20GB SSD
- **Network**: 1Gbps

### Recommended for Production
- **CPU**: 4 vCPU
- **RAM**: 8GB
- **Storage**: 50GB SSD
- **Network**: 10Gbps

## 🐳 Docker Deployment

### Dockerfile
```dockerfile
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:18-alpine AS runtime

WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY dist ./dist
COPY package*.json ./

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001
USER nodejs

EXPOSE 4000
CMD ["node", "dist/index.js"]
```

### Docker Compose
```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "4000:4000"
    environment:
      - NODE_ENV=production
      - PORT=4000
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    restart: unless-stopped
    command: redis-server --appendonly yes

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - app
    restart: unless-stopped

volumes:
  redis_data:
```

## ☁️ Cloud Deployment

### AWS Deployment

#### ECS with Fargate
```yaml
# task-definition.json
{
  "family": "chatgbtmini-backend",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "executionRoleArn": "arn:aws:iam::account:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::account:role/ecsTaskRole",
  "containerDefinitions": [
    {
      "name": "backend",
      "image": "your-account.dkr.ecr.region.amazonaws.com/chatgbtmini-backend:latest",
      "portMappings": [
        {
          "containerPort": 4000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        }
      ],
      "secrets": [
        {
          "name": "JWT_HS_SECRET",
          "valueFrom": "arn:aws:secretsmanager:region:account:secret:jwt-secret"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/chatgbtmini-backend",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

#### RDS for Redis (ElastiCache)
```bash
# Create Redis cluster
aws elasticache create-cache-cluster \
  --cache-cluster-id chatgbtmini-redis \
  --cache-node-type cache.t3.micro \
  --engine redis \
  --num-cache-nodes 1
```

### Google Cloud Platform

#### Cloud Run
```yaml
# cloudbuild.yaml
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', 'gcr.io/$PROJECT_ID/chatgbtmini-backend', '.']
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'gcr.io/$PROJECT_ID/chatgbtmini-backend']
  - name: 'gcr.io/cloud-builders/gcloud'
    args: [
      'run', 'deploy', 'chatgbtmini-backend',
      '--image', 'gcr.io/$PROJECT_ID/chatgbtmini-backend',
      '--region', 'us-central1',
      '--platform', 'managed',
      '--allow-unauthenticated'
    ]
```

#### Memorystore for Redis
```bash
# Create Redis instance
gcloud redis instances create chatgbtmini-redis \
  --size=1 \
  --region=us-central1 \
  --redis-version=redis_6_x
```

### Azure

#### Container Instances
```yaml
# azure-deploy.yaml
apiVersion: 2021-07-01
location: eastus
name: chatgbtmini-backend
properties:
  containers:
  - name: backend
    properties:
      image: your-registry.azurecr.io/chatgbtmini-backend:latest
      ports:
      - port: 4000
        protocol: TCP
      environmentVariables:
      - name: NODE_ENV
        value: production
      resources:
        requests:
          cpu: 1.0
          memoryInGb: 2.0
  osType: Linux
  restartPolicy: Always
  ipAddress:
    type: Public
    ports:
    - protocol: TCP
      port: 4000
```

## 🔧 Environment Configuration

### Production Environment Variables
```bash
# Server
NODE_ENV=production
PORT=4000
LOG_LEVEL=warn

# Security
JWT_HS_SECRET=<strong-random-secret>
CORS_ORIGIN=https://yourdomain.com,https://app.yourdomain.com

# Database
FIREBASE_PROJECT_ID=<your-project-id>
FIREBASE_CLIENT_EMAIL=<service-account-email>
FIREBASE_PRIVATE_KEY=<service-account-private-key>

# Cache
REDIS_URL=redis://your-redis-host:6379

# Rate Limiting
MAX_FAILED_ATTEMPTS=5
LOCKOUT_DURATION_MINUTES=30
```

### Secrets Management

#### AWS Secrets Manager
```bash
# Store JWT secret
aws secretsmanager create-secret \
  --name "chatgbtmini/jwt-secret" \
  --description "JWT signing secret" \
  --secret-string "your-super-secret-jwt-key"
```

#### Google Secret Manager
```bash
# Create secret
gcloud secrets create jwt-secret --data-file=- <<< "your-super-secret-jwt-key"
```

#### Azure Key Vault
```bash
# Create secret
az keyvault secret set \
  --vault-name "your-keyvault" \
  --name "jwt-secret" \
  --value "your-super-secret-jwt-key"
```

## 🔒 SSL/TLS Configuration

### Nginx Configuration
```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;
    ssl_prefer_server_ciphers off;

    location / {
        proxy_pass http://app:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Let's Encrypt
```bash
# Install certbot
sudo apt-get install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d yourdomain.com
```

## 📊 Monitoring & Logging

### Prometheus Metrics
```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'chatgbtmini-backend'
    static_configs:
      - targets: ['localhost:4000']
    metrics_path: '/metrics'
    scrape_interval: 5s
```

### Grafana Dashboard
```json
{
  "dashboard": {
    "title": "ChatGBT Mini Backend",
    "panels": [
      {
        "title": "Request Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(http_requests_total[5m])"
          }
        ]
      },
      {
        "title": "Error Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(http_requests_total{status=~\"5..\"}[5m])"
          }
        ]
      }
    ]
  }
}
```

### Log Aggregation
```yaml
# docker-compose.yml
services:
  app:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  fluentd:
    image: fluent/fluentd
    volumes:
      - ./fluent.conf:/fluentd/etc/fluent.conf
    ports:
      - "24224:24224"
```

## 🔄 CI/CD Pipeline

### GitHub Actions
```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm test

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Build Docker image
        run: docker build -t chatgbtmini-backend .
      - name: Deploy to AWS ECS
        run: |
          aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $ECR_REGISTRY
          docker tag chatgbtmini-backend:latest $ECR_REGISTRY/chatgbtmini-backend:latest
          docker push $ECR_REGISTRY/chatgbtmini-backend:latest
          aws ecs update-service --cluster production --service chatgbtmini-backend --force-new-deployment
```

### GitLab CI
```yaml
stages:
  - test
  - build
  - deploy

test:
  stage: test
  script:
    - npm ci
    - npm test

build:
  stage: build
  script:
    - docker build -t $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA .
    - docker push $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA

deploy:
  stage: deploy
  script:
    - kubectl set image deployment/chatgbtmini-backend backend=$CI_REGISTRY_IMAGE:$CI_COMMIT_SHA
  only:
    - main
```

## 🚨 Disaster Recovery

### Backup Strategy
```bash
#!/bin/bash
# backup.sh

# Backup Firestore
gcloud firestore export gs://your-backup-bucket/firestore-backup-$(date +%Y%m%d)

# Backup Redis
redis-cli --rdb /tmp/redis-backup-$(date +%Y%m%d).rdb
aws s3 cp /tmp/redis-backup-$(date +%Y%m%d).rdb s3://your-backup-bucket/

# Backup environment variables
kubectl get secret chatgbtmini-secrets -o yaml > secrets-backup-$(date +%Y%m%d).yaml
```

### Recovery Procedures
```bash
#!/bin/bash
# recovery.sh

# Restore Firestore
gcloud firestore import gs://your-backup-bucket/firestore-backup-20231201

# Restore Redis
aws s3 cp s3://your-backup-bucket/redis-backup-20231201.rdb /tmp/
redis-cli --rdb /tmp/redis-backup-20231201.rdb

# Restore secrets
kubectl apply -f secrets-backup-20231201.yaml
```

## 📈 Performance Optimization

### Caching Strategy
```javascript
// Redis caching for user data
const cacheUser = async (userId, userData) => {
  await redis.setex(`user:${userId}`, 300, JSON.stringify(userData));
};

const getCachedUser = async (userId) => {
  const cached = await redis.get(`user:${userId}`);
  return cached ? JSON.parse(cached) : null;
};
```

### Database Optimization
```javascript
// Firestore indexes
// users collection: email (ascending)
// sessions collection: userId (ascending), revokedAt (ascending)
// auditLogs collection: userId (ascending), createdAt (descending)
```

## 🔍 Troubleshooting

### Common Issues

#### High Memory Usage
```bash
# Check memory usage
docker stats

# Optimize Node.js memory
NODE_OPTIONS="--max-old-space-size=4096"
```

#### Redis Connection Issues
```bash
# Test Redis connection
redis-cli ping

# Check Redis logs
docker logs redis-container
```

#### Firestore Quota Exceeded
```bash
# Check Firestore usage
gcloud firestore operations list

# Optimize queries
# Use composite indexes
# Implement pagination
```

### Health Checks
```bash
# Application health
curl http://localhost:4000/health

# Database connectivity
curl http://localhost:4000/health/db

# Redis connectivity
curl http://localhost:4000/health/redis
```

## 📞 Support

- **Documentation**: [API Docs](./README.md)
- **Issues**: GitHub Issues
- **Monitoring**: Grafana Dashboard
- **Logs**: Centralized logging system
- **Alerts**: PagerDuty/Slack integration


