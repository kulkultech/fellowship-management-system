BACKEND := apps/backend
MIGRATIONS := $(BACKEND)/internal/repository/migrations

ifneq (,$(wildcard $(BACKEND)/.env))
include $(BACKEND)/.env
export
endif

.DEFAULT_GOAL := help
.PHONY: help setup install infra-up infra-down dev dev-backend dev-frontend \
        build build-backend build-frontend lint lint-backend lint-frontend \
        test test-backend test-frontend migrate-up migrate-down migrate-status migrate-create seed clean

help: ## Show this help
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

setup: ## First-time setup: copy .env files + install deps
	@test -f $(BACKEND)/.env || cp $(BACKEND)/.env.example $(BACKEND)/.env
	@test -f apps/frontend/.env || cp apps/frontend/.env.example apps/frontend/.env
	npm install

install: ## Install dependencies
	npm install

infra-up: ## Start Postgres + Redis
	docker compose up -d postgres redis

infra-down: ## Stop infrastructure
	docker compose down

dev: infra-up ## Start infra + backend + frontend
	npx turbo run dev

dev-backend: ## Run the Go API
	cd $(BACKEND) && go run ./cmd/api

dev-frontend: ## Run the Vite dev server
	npm run dev --prefix apps/frontend

build: ## Build all apps
	npx turbo run build

build-backend: ## Build the Go binary only
	cd $(BACKEND) && go build -o bin/api ./cmd/api

build-frontend: ## Build the frontend only
	npm run build --prefix apps/frontend

lint: lint-backend lint-frontend ## Lint backend + frontend

lint-backend: ## Lint the Go backend only
	cd $(BACKEND) && go vet ./...

lint-frontend: ## Lint the frontend only
	npm run lint --prefix apps/frontend

test: test-backend test-frontend ## Test backend + frontend

test-backend: ## Test the Go backend only
	cd $(BACKEND) && go test -v ./...

test-frontend: ## Test the frontend only
	npm run test --prefix apps/frontend

migrate-up: ## Apply all DB migrations
	goose -dir $(MIGRATIONS) postgres "$(DATABASE_URL)" up

migrate-down: ## Roll back the latest migration
	goose -dir $(MIGRATIONS) postgres "$(DATABASE_URL)" down

migrate-status: ## Show migration status
	goose -dir $(MIGRATIONS) postgres "$(DATABASE_URL)" status

migrate-create: ## Create a migration: make migrate-create name=add_table
	goose -dir $(MIGRATIONS) create $(name) sql

seed: ## Seed local mock data (RSA, LIT 2026, MCQs, Admin)
	cd $(BACKEND) && go run ./cmd/seed

clean: ## Remove build artifacts
	rm -rf $(BACKEND)/bin apps/frontend/dist .turbo apps/*/.turbo
