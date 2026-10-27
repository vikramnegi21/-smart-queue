# 🏥 CarePoint - Smart Hospital Queue & Real-Time Flow System

[![Live Demo](https://img.shields.io/badge/🚀_Live_Demo-Click_Here-2ea44f?style=for-the-badge)](https://smart-queue-zjez.onrender.com)

> 🔗 **Live Application URL:** [https://smart-queue-zjez.onrender.com](https://smart-queue-zjez.onrender.com)

---

## 🎯 Project Overview
**CarePoint** is a full-stack, real-time hospital queue management platform engineered to eliminate physical waiting lines, optimize clinical workflows, and deliver live status updates for patients, doctors, and administrators. It ensures high performance using Redis caching and handles concurrent operations smoothly with secure session authentication and database-level checks.

---

## 🏗️ System Architecture & Data Flow

```mermaid
flowchart TD
    Client[Patient / Doctor / Admin] -->|REST requests| API[Express.js API]
    Client <-->|Real-time events| WS[Socket.IO]
    API --> AUTH[Session Authentication and RBAC]
    AUTH --> LOGIC[Queue and Appointment Logic]
    
    LOGIC -->|Cache-aside read| REDIS[(Redis Cache)]
    REDIS -->|Cache hit| LOGIC
    REDIS -.->|Cache miss or unavailable| SQL[(SQL Database)]
    
    LOGIC -->|Transactional writes| SQL
    SQL -->|Result / commit| LOGIC
    
    LOGIC -->|Emit queue updates| WS
    WS --> Client
