# 🏥 CarePoint - Smart Hospital Queue & Real-Time Flow System

[![Live Demo](https://img.shields.io/badge/🚀_Live_Demo-Click_Here-2ea44f?style=for-the-badge)](https://smart-queue-zjez.onrender.com)

> **Live Application URL:** https://smart-queue-zjez.onrender.com

---

## 🎯 Project Overview
CarePoint is a full-stack, real-time hospital queue management platform engineered to eliminate physical waiting lines, optimize clinical workflows, and deliver live status synchronization for patients and doctors.

---

## 🏗️ System Architecture & Data Flow

```mermaid
graph TD
    Client[Patient / Display Board Client] <-->|WebSocket Events| WS[Socket.io Engine]
    Client -->|REST API Requests| Server[Express.js Backend Server]
    
    subgraph Optimization Layer
        Server -->|Cache-Aside Read| Redis[(Redis In-Memory Cache)]
    end

    subgraph Data Layer
        Server -->|ACID Transactions| DB[(SQL Database / 3NF Schema)]
    end

    Redis -.->|Fallback on Cache Miss| DB
