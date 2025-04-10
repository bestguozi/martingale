# Project Brief: Multi-User Martingale Trading System

## 1. Core Purpose

This project implements a **multi-user** automated cryptocurrency **Martingale strategy** trading system using Node.js, CCXT library, and MySQL database. The system allows multiple users to run independent Martingale strategies with their own API keys and parameters, while providing centralized logging and state management.

## 2. Key Components & Functionality

*   **Multi-User Architecture:**
    *   Supports multiple users with isolated strategies and API keys
    *   Each user can create multiple trading strategies
    *   User authentication and API key management

*   **Database-Driven Design:**
    *   MySQL database for persistent storage
    *   Prisma ORM for data access
    *   Stores users, API key metadata, strategy configurations, strategy states, and operation logs

*   **Exchange Integration:**
    *   Connects to multiple cryptocurrency exchanges via CCXT
    *   API keys stored securely (public keys in DB, secrets in secure config)
    *   Supports multiple exchanges per user

*   **Martingale Strategy Engine:**
    *   Calculates buy price levels and amounts based on parameters
    *   Manages order placement and tracking
    *   Handles take-profit and stop-loss logic
    *   State persistence to database

*   **Services Architecture:**
    *   `userService` - Manages users and API key metadata
    *   `logService` - Centralized logging to console and database
    *   `strategyService` - Coordinates strategy lifecycle and exchange interactions

*   **Configuration:**
    *   Environment variables (`.env`) for database and core settings
    *   Secure config file (`config/secrets.json`) for sensitive API credentials
    *   Database-driven strategy parameters

*   **Execution:**
    *   Runs as Node.js application (`node app.js`)
    *   Graceful startup and shutdown
    *   Automatic recovery of active strategies

## 3. Key Improvements from Original

*   Multi-user support with proper isolation
*   Database persistence instead of file-based state
*   Structured logging with audit trail
*   Modular architecture with clear separation of concerns
*   Enhanced error handling and recovery
*   Secure credential management
*   Scalable design for multiple strategies/exchanges

## 4. High-Level Goals

*   Provide secure, isolated trading environments for multiple users
*   Maintain complete audit trail of all operations
*   Ensure strategy state persistence across restarts
*   Enable flexible strategy configuration
*   Implement robust error handling and safety mechanisms
*   Support monitoring and management of active strategies

*(This brief has been updated to reflect the new multi-user architecture as of 2025-04-09.)*
