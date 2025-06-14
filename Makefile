# Yeyzer AI Match-Assistant - Development Makefile
# This Makefile provides commands for local development, testing, and deployment

# ===== VARIABLES =====
SHELL := /bin/bash
.PHONY: all clean install build dev test lint format docker-build docker-up docker-down db-migrate db-seed help deploy-staging deploy-prod

# Project name
PROJECT_NAME := yeyzer-ai

# Environment
ENV ?= development
NODE_ENV ?= $(ENV)

# Docker
DOCKER_COMPOSE := docker compose
DOCKER_REGISTRY ?= ghcr.io
DOCKER_IMAGE_PREFIX ?= yeyzer
DOCKER_TAG ?= latest

# Kubernetes
KUBE_CONTEXT_STAGING ?= staging
KUBE_CONTEXT_PROD ?= production
KUBE_NAMESPACE_STAGING ?= yeyzer-staging
KUBE_NAMESPACE_PROD ?= yeyzer-production

# Services
SERVICES := auth profile scraper match-engine conversation venue voice safety
ALL_SERVICES := $(SERVICES) gateway frontend

# Database
DB_NAME ?= yeyzer
DB_USER ?= postgres
DB_PASSWORD ?= postgres
DB_HOST ?= localhost
DB_PORT ?= 5432
DB_URL := postgresql://$(DB_USER):$(DB_PASSWORD)@$(DB_HOST):$(DB_PORT)/$(DB_NAME)

# Colors
COLOR_RESET := \033[0m
COLOR_BOLD := \033[1m
COLOR_GREEN := \033[32m
COLOR_YELLOW := \033[33m
COLOR_BLUE := \033[34m
COLOR_MAGENTA := \033[35m

# ===== MAIN COMMANDS =====

# Default target
all: help

# Help command
help:
	@echo -e "$(COLOR_BOLD)Yeyzer AI Match-Assistant - Development Commands$(COLOR_RESET)"
	@echo -e "$(COLOR_BOLD)=====================================$(COLOR_RESET)"
	@echo -e "$(COLOR_GREEN)Setup:$(COLOR_RESET)"
	@echo -e "  $(COLOR_BOLD)make install$(COLOR_RESET)        - Install all dependencies"
	@echo -e "  $(COLOR_BOLD)make build$(COLOR_RESET)          - Build all services"
	@echo -e "  $(COLOR_BOLD)make clean$(COLOR_RESET)          - Clean build artifacts"
	@echo -e ""
	@echo -e "$(COLOR_GREEN)Development:$(COLOR_RESET)"
	@echo -e "  $(COLOR_BOLD)make dev$(COLOR_RESET)            - Start all services in development mode"
	@echo -e "  $(COLOR_BOLD)make dev-service$(COLOR_RESET)    - Start a specific service (e.g., make dev-auth)"
	@echo -e ""
	@echo -e "$(COLOR_GREEN)Testing:$(COLOR_RESET)"
	@echo -e "  $(COLOR_BOLD)make test$(COLOR_RESET)           - Run all tests"
	@echo -e "  $(COLOR_BOLD)make test-service$(COLOR_RESET)   - Test a specific service (e.g., make test-auth)"
	@echo -e "  $(COLOR_BOLD)make test-coverage$(COLOR_RESET)  - Run tests with coverage"
	@echo -e "  $(COLOR_BOLD)make test-e2e$(COLOR_RESET)       - Run end-to-end tests"
	@echo -e ""
	@echo -e "$(COLOR_GREEN)Code Quality:$(COLOR_RESET)"
	@echo -e "  $(COLOR_BOLD)make lint$(COLOR_RESET)           - Run linting on all code"
	@echo -e "  $(COLOR_BOLD)make format$(COLOR_RESET)         - Format code with Prettier"
	@echo -e "  $(COLOR_BOLD)make typecheck$(COLOR_RESET)      - Run TypeScript type checking"
	@echo -e ""
	@echo -e "$(COLOR_GREEN)Docker:$(COLOR_RESET)"
	@echo -e "  $(COLOR_BOLD)make docker-build$(COLOR_RESET)   - Build all Docker images"
	@echo -e "  $(COLOR_BOLD)make docker-up$(COLOR_RESET)      - Start all containers"
	@echo -e "  $(COLOR_BOLD)make docker-down$(COLOR_RESET)    - Stop all containers"
	@echo -e "  $(COLOR_BOLD)make docker-logs$(COLOR_RESET)    - View container logs"
	@echo -e ""
	@echo -e "$(COLOR_GREEN)Database:$(COLOR_RESET)"
	@echo -e "  $(COLOR_BOLD)make db-create$(COLOR_RESET)      - Create database"
	@echo -e "  $(COLOR_BOLD)make db-migrate$(COLOR_RESET)     - Run database migrations"
	@echo -e "  $(COLOR_BOLD)make db-seed$(COLOR_RESET)        - Seed database with test data"
	@echo -e "  $(COLOR_BOLD)make db-reset$(COLOR_RESET)       - Reset database (drop and recreate)"
	@echo -e ""
	@echo -e "$(COLOR_GREEN)Deployment:$(COLOR_RESET)"
	@echo -e "  $(COLOR_BOLD)make deploy-staging$(COLOR_RESET) - Deploy to staging environment"
	@echo -e "  $(COLOR_BOLD)make deploy-prod$(COLOR_RESET)    - Deploy to production environment"
	@echo -e ""

# ===== SETUP COMMANDS =====

# Install dependencies
install:
	@echo -e "$(COLOR_BLUE)Installing dependencies...$(COLOR_RESET)"
	npm ci

# Build all services
build:
	@echo -e "$(COLOR_BLUE)Building all services...$(COLOR_RESET)"
	npm run build

# Clean build artifacts
clean:
	@echo -e "$(COLOR_BLUE)Cleaning build artifacts...$(COLOR_RESET)"
	npm run clean --workspaces --if-present
	rm -rf node_modules/.cache
	rm -rf coverage

# ===== DEVELOPMENT COMMANDS =====

# Start all services in development mode
dev:
	@echo -e "$(COLOR_BLUE)Starting all services in development mode...$(COLOR_RESET)"
	npm run dev

# Start a specific service in development mode
dev-%:
	@echo -e "$(COLOR_BLUE)Starting $* service in development mode...$(COLOR_RESET)"
	npm run dev --workspace=@yeyzer/$*

# ===== TESTING COMMANDS =====

# Run all tests
test:
	@echo -e "$(COLOR_BLUE)Running all tests...$(COLOR_RESET)"
	npm test

# Test a specific service
test-%:
	@echo -e "$(COLOR_BLUE)Testing $* service...$(COLOR_RESET)"
	npm test --workspace=@yeyzer/$*

# Run tests with coverage
test-coverage:
	@echo -e "$(COLOR_BLUE)Running tests with coverage...$(COLOR_RESET)"
	npm test -- --coverage

# Run end-to-end tests
test-e2e:
	@echo -e "$(COLOR_BLUE)Running end-to-end tests...$(COLOR_RESET)"
	cd tests/e2e && npm test

# ===== CODE QUALITY COMMANDS =====

# Run linting
lint:
	@echo -e "$(COLOR_BLUE)Running linting...$(COLOR_RESET)"
	npm run lint

# Format code with Prettier
format:
	@echo -e "$(COLOR_BLUE)Formatting code...$(COLOR_RESET)"
	npm run format

# Run TypeScript type checking
typecheck:
	@echo -e "$(COLOR_BLUE)Running TypeScript type checking...$(COLOR_RESET)"
	npm run typecheck --workspaces --if-present

# ===== DOCKER COMMANDS =====

# Build all Docker images
docker-build:
	@echo -e "$(COLOR_BLUE)Building all Docker images...$(COLOR_RESET)"
	$(DOCKER_COMPOSE) build

# Build a specific Docker image
docker-build-%:
	@echo -e "$(COLOR_BLUE)Building $* Docker image...$(COLOR_RESET)"
	$(DOCKER_COMPOSE) build $*

# Start all containers
docker-up:
	@echo -e "$(COLOR_BLUE)Starting all containers...$(COLOR_RESET)"
	$(DOCKER_COMPOSE) up -d

# Start a specific container
docker-up-%:
	@echo -e "$(COLOR_BLUE)Starting $* container...$(COLOR_RESET)"
	$(DOCKER_COMPOSE) up -d $*

# Stop all containers
docker-down:
	@echo -e "$(COLOR_BLUE)Stopping all containers...$(COLOR_RESET)"
	$(DOCKER_COMPOSE) down

# View container logs
docker-logs:
	@echo -e "$(COLOR_BLUE)Viewing container logs...$(COLOR_RESET)"
	$(DOCKER_COMPOSE) logs -f

# View logs for a specific container
docker-logs-%:
	@echo -e "$(COLOR_BLUE)Viewing $* container logs...$(COLOR_RESET)"
	$(DOCKER_COMPOSE) logs -f $*

# Push Docker images to registry
docker-push:
	@echo -e "$(COLOR_BLUE)Pushing Docker images to registry...$(COLOR_RESET)"
	@for service in $(ALL_SERVICES); do \
		echo "Pushing $(DOCKER_REGISTRY)/$(DOCKER_IMAGE_PREFIX)-$$service:$(DOCKER_TAG)"; \
		docker push $(DOCKER_REGISTRY)/$(DOCKER_IMAGE_PREFIX)-$$service:$(DOCKER_TAG); \
	done

# ===== DATABASE COMMANDS =====

# Create database
db-create:
	@echo -e "$(COLOR_BLUE)Creating database...$(COLOR_RESET)"
	@PGPASSWORD=$(DB_PASSWORD) createdb -h $(DB_HOST) -p $(DB_PORT) -U $(DB_USER) $(DB_NAME) || echo "Database already exists"

# Drop database
db-drop:
	@echo -e "$(COLOR_BLUE)Dropping database...$(COLOR_RESET)"
	@PGPASSWORD=$(DB_PASSWORD) dropdb -h $(DB_HOST) -p $(DB_PORT) -U $(DB_USER) --if-exists $(DB_NAME)

# Reset database (drop and recreate)
db-reset: db-drop db-create db-migrate db-seed
	@echo -e "$(COLOR_GREEN)Database reset complete!$(COLOR_RESET)"

# Run database migrations
db-migrate:
	@echo -e "$(COLOR_BLUE)Running database migrations...$(COLOR_RESET)"
	@PGPASSWORD=$(DB_PASSWORD) psql -h $(DB_HOST) -p $(DB_PORT) -U $(DB_USER) -d $(DB_NAME) -f infrastructure/docker/postgres/init/01-create-schemas.sql

# Seed database with test data
db-seed:
	@echo -e "$(COLOR_BLUE)Seeding database with test data...$(COLOR_RESET)"
	@if [ -f scripts/seed-db.js ]; then \
		NODE_ENV=$(NODE_ENV) DATABASE_URL=$(DB_URL) node scripts/seed-db.js; \
	else \
		echo "No seed script found"; \
	fi

# ===== DEPLOYMENT COMMANDS =====

# Deploy to staging environment
deploy-staging:
	@echo -e "$(COLOR_BLUE)Deploying to staging environment...$(COLOR_RESET)"
	@kubectl config use-context $(KUBE_CONTEXT_STAGING)
	@cd infrastructure/kubernetes/helm && \
		helm dependency update && \
		helm upgrade --install $(PROJECT_NAME) . \
		--namespace $(KUBE_NAMESPACE_STAGING) \
		--create-namespace \
		--set global.environment=staging \
		--set global.imageTag=$(DOCKER_TAG) \
		--set global.registry=$(DOCKER_REGISTRY) \
		--set global.imagePrefix=$(DOCKER_IMAGE_PREFIX) \
		--wait --timeout 10m
	@echo -e "$(COLOR_GREEN)Deployment to staging complete!$(COLOR_RESET)"

# Deploy to production environment
deploy-prod:
	@echo -e "$(COLOR_MAGENTA)CAUTION: Deploying to PRODUCTION environment!$(COLOR_RESET)"
	@read -p "Are you sure you want to deploy to production? (y/n) " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		echo -e "$(COLOR_BLUE)Deploying to production environment...$(COLOR_RESET)"; \
		kubectl config use-context $(KUBE_CONTEXT_PROD); \
		cd infrastructure/kubernetes/helm && \
		helm dependency update && \
		helm upgrade --install $(PROJECT_NAME) . \
		--namespace $(KUBE_NAMESPACE_PROD) \
		--create-namespace \
		--set global.environment=production \
		--set global.imageTag=$(DOCKER_TAG) \
		--set global.registry=$(DOCKER_REGISTRY) \
		--set global.imagePrefix=$(DOCKER_IMAGE_PREFIX) \
		--wait --timeout 10m; \
		echo -e "$(COLOR_GREEN)Deployment to production complete!$(COLOR_RESET)"; \
	else \
		echo -e "$(COLOR_YELLOW)Production deployment cancelled.$(COLOR_RESET)"; \
	fi

# Generate Kubernetes manifests from Helm charts (for CI/CD)
k8s-manifests:
	@echo -e "$(COLOR_BLUE)Generating Kubernetes manifests from Helm charts...$(COLOR_RESET)"
	@mkdir -p infrastructure/kubernetes/manifests
	@cd infrastructure/kubernetes/helm && \
		helm dependency update && \
		helm template $(PROJECT_NAME) . \
		--namespace $(KUBE_NAMESPACE_STAGING) \
		--set global.environment=staging \
		--set global.imageTag=$(DOCKER_TAG) \
		--set global.registry=$(DOCKER_REGISTRY) \
		--set global.imagePrefix=$(DOCKER_IMAGE_PREFIX) \
		> ../manifests/staging.yaml
	@echo -e "$(COLOR_GREEN)Kubernetes manifests generated!$(COLOR_RESET)"

# ===== UTILITY COMMANDS =====

# Generate GraphQL types
codegen:
	@echo -e "$(COLOR_BLUE)Generating GraphQL types...$(COLOR_RESET)"
	@cd gateway && npm run codegen

# Update dependencies
update-deps:
	@echo -e "$(COLOR_BLUE)Updating dependencies...$(COLOR_RESET)"
	npm update

# Security audit
security-audit:
	@echo -e "$(COLOR_BLUE)Running security audit...$(COLOR_RESET)"
	npm audit --production

# Generate documentation
docs:
	@echo -e "$(COLOR_BLUE)Generating documentation...$(COLOR_RESET)"
	@if [ -f scripts/generate-docs.js ]; then \
		node scripts/generate-docs.js; \
	else \
		echo "No documentation generator found"; \
	fi
