# 🏥 CarePoint - Smart Hospital Queue & Real-Time Flow System

[![Live Demo](https://img.shields.io/badge/🚀_Live_Demo-Click_Here-2ea44f?style=for-the-badge)](https://smart-queue-zjez.onrender.com)

> 🔗 **Live Application URL:** [https://smart-queue-zjez.onrender.com](https://smart-queue-zjez.onrender.com)

---

## 🎯 Project Overview
CarePoint is a full-stack, real-time hospital queue management platform engineered to eliminate physical waiting lines, optimize clinical workflows, and deliver live status updates for patients and doctors.

---

## 🏗️ System Architecture & Data Flow

```mermaid
flowchart TD
    U[Patient / Doctor / Admin] -->|REST API Requests| API[Express.js Backend Server]
    U <-->|Real-Time WebSocket Events| WS[Socket.IO Engine]
    API --> AUTH[Session Auth & RBAC]
    AUTH --> LOGIC[Queue Logic Layer]
    LOGIC -->|Cache-Aside Read| REDIS[(Redis Memory Cache)]
    REDIS -.->|Fallback on Cache Miss| SQL[(SQL Database / 3NF Schema)]
    LOGIC -->|ACID Transactions| SQL
    LOGIC -->|Emit Queue Updates| WS
