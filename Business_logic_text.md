This project is about building a scalable video communication platform that connects volunteers with students for remote mentoring or tutoring sessions. Here's a breakdown of the key aspects:
Core Purpose

Create a platform where volunteers can connect with students via video chat
Support one-to-one video meetings between volunteers and students

User Types & Registration

Volunteers: Need to provide comprehensive details (name, country, email, phone, age, profile picture, gender)
Students: Need to provide basic details (name, age, gender, country, profile picture, bio)
Special handling for underage volunteers (parental approval process)
Volunteers types require account verification via email or phone

Meeting Functionality

Volunteers can schedule meeting with only one student daily
Students receive notifications about upcoming meetings on their dashboard
Volunteers can add/remove student before or during meetings
Meeting metadata is saved (but not audio/video content)
Time zone management for global usage
Scheduling system prevents double-booking of students

Technical Architecture

Backend: Node.js, Redis, PostgreSQL, pg-boss, Express, WebSockets
Frontend: html, css, js
Microservice and API-first approach
Docker for containerization
NGINX for proxy and API management

The project requires careful attention to scalability, scheduling across time zones, user management, and real-time communication. The architecture emphasizes industry best practices for reliability and performance, with specialized components for different aspects of the application's functionality.