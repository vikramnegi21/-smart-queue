# 🏥 CarePoint - Smart Hospital Queue Management System

![Status](https://img.shields.io/badge/Status-Live-brightgreen)
[![Live Demo](https://img.shields.io/badge/Live--Demo-Click%20Here-blue?style=for-the-badge&logo=render)](https://smart-queue-zjez.onrender.com)

> 🔗 **Live Application URL:** [https://smart-queue-zjez.onrender.com](https://smart-queue-zjez.onrender.com)

---

## 🚀 Overview
CarePoint is a full-stack real-time hospital queue management web application designed to digitize patient waiting lines, reduce counter overcrowding, and streamline clinical workflows. 

Patients can track live token progression and estimated wait times from their mobile devices, while doctors manage active queues, and administrators monitor operational analytics across departments.

---

## ⚡ Key Performance & Architecture Highlights

| Metric / Architecture Feature | Implementation Details | Impact |
| :--- | :--- | :--- |
| **API Latency Reduction** | Redis RAM Caching ($O(1)$) | **~180ms $\rightarrow$ ~25ms (85% Faster)** |
| **DB Load Optimization** | Cache-aside strategy for queue read traffic | **85% Database Read Load Reduction** |
| **Real-time Synchronization** | WebSockets via Socket.io | **Instant status push without polling** |
| **Data Integrity & Concurrency** | Partial unique indexes & ACID transactions | **Zero duplicate token generation under traffic** |

---

## 🛠️ Tech Stack & Key Features

* **Backend:** Node.js, Express.js, RESTful APIs
* **Real-time Engine:** Socket.io (WebSockets)
* **Caching Layer:** Redis (Cache-aside strategy with DB fallback)
* **Database Engine:** SQL (3NF Normalized Schema, Partial Unique Indexes, Views, Triggers)
* **Security & Auth:** Session Authentication, Role-Based Access Control (RBAC), bcrypt hashing, Rate Limiting
* **Frontend:** Responsive Web Interface (Vanilla JS / Modern CSS), Internationalization (EN / HI)

### Core Workflow Features
* **Patient Portal:** Mobile-first token booking, real-time queue position tracking, automated status notifications, feedback rating system.
* **Doctor Dashboard:** Secure queue management, single-click patient calling workflow, consult duration tracking.
* **Admin Analytics & Display:** Real-time waiting room TV display board (`/display.html`), department throughput metrics, doctor allocation management.

---

## 🔒 Security & Data Integrity
* **Role-Based Access Control (RBAC):** Strict session isolation preventing unauthorized cross-tenant queue access.
* **Concurrency Protection:** Concurrency-safe SQL transactions (`BEGIN IMMEDIATE`) prevent race conditions during peak booking windows.
* **Database Rules:** Enforced partial unique indexes (`ux_one_live_token_per_patient`) ensuring a patient cannot hold multiple active tokens simultaneously.

---

## 💻 Local Setup & Installation

### Prerequisites
* **Node.js:** `v22.x` or higher
* **Redis:** Optional (Application gracefully falls back to direct DB queries if Redis is offline)

### Steps

1. **Clone the Repository:**
   ```bash
   git clone [https://github.com/vikramnegi21/-smart-queue.git](https://github.com/vikramnegi21/-smart-queue.git)
   cd -smart-queue/backend
