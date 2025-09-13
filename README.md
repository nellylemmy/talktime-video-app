# TalkTime - Empowering Through Conversation

<p align="center">
  <img src="https://user-images.githubusercontent.com/1234567/100000000-abcdef123456.png" alt="TalkTime Logo" width="200"/>
</p>

**TalkTime** is a modern, secure, and user-friendly video conferencing platform designed to connect enthusiastic volunteers with Maasai students in Rombo, Kenya. Our mission is to boost English skills and build confidence through friendly, one-on-one video conversations.

This project is built with a focus on simplicity and impact, providing a seamless experience for both volunteers and students. It is proudly supported by the **ADEA Foundation**.

---

## ✨ Features

- **Modern, Responsive UI**: A beautiful, branded interface that looks great on any device.
- **Role-Based Access**: Separate, tailored flows for Volunteers and Students.
- **One-to-One Video Calls**: Direct, secure video connections powered by WebRTC.
- **40-Minute Call Timer**: A built-in timer ensures sessions are focused and consistent, automatically ending the call after 40 minutes.
- **Admin Controls**: Volunteers have administrative privileges during calls.
- **Simple Meeting Links**: Easy-to-use links for joining meetings.

## 🚀 Getting Started

To get a local copy up and running, follow these simple steps.

### Prerequisites

- [Node.js](https://nodejs.org/en/) (which includes npm)

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/nellylemmy/talktime-video-app.git
    ```
2.  **Navigate to the project directory:**
    ```bash
    cd talktime-video-app
    ```
3.  **Install NPM dependencies:**
    ```bash
    npm install
    ```
4.  **Start the development server:**
    ```bash
    npm start
    ```
    The application will be running at `http://localhost:3000`.

## 📂 Project Structure

| Name | Description |
| :--- | :--- |
| **`public/`** | Contains all static assets for the frontend. |
| ┣ `css/main.css` | Custom stylesheets for the application. |
| ┣ `js/main.js` | Core application logic for the user interface and event handling. |
| ┣ `js/webrtc.js` | Handles all WebRTC peer-to-peer connection logic. |
| ┣ `index.html` | The main landing page for the website. |
| ┣ `app.html` | The core video conferencing application page. |
| ┣ `data.json` | Mock data for students and volunteers. |
| **`server.js`** | The Node.js/Express server that handles signaling and serves the app. |
| **`package.json`** | Lists project dependencies and scripts. |
| **`README.md`** | You are here! |

## 🛠️ Technology Stack

- **Frontend**: HTML5, CSS3, JavaScript, Tailwind CSS
- **Backend**: Node.js, Express
- **Real-Time Communication**: WebRTC, Socket.IO

## 🤝 Contributing

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

If you have a suggestion that would make this better, please fork the repo and create a pull request. You can also simply open an issue with the tag "enhancement".

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

## 📜 License

This project is proprietary and all rights are reserved. See the `LICENSE` file for more information.

---

> Built with ❤️ by the **ADEA Foundation** for the students of the Maasai community.

-   **logging** - enable or disable logging on actions.
    -   log - enable console.log
    -   warn - enable console.warn
    -   error - enable console.error

```js
{
    log: true,
    warn: true,
    error: true,
}
```

## webrtc.getLocalStream()

After initialization local media stream should be accessed.

```js
webrtc
    .getLocalStream(true, { width: 640, height: 480 })
    .then((stream) => (localVideo.srcObject = stream));
```

getLocalStream takes two arguments for `audio` and `video` constraints. It returns promise, which returns a stream from local media that can be attached to an HTML audio or video element as a source, element should be set on `autoplay`.

The method actually returns [navigator.getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).

## webrtc.joinRoom()

After initialization room can be joined with `joinRoom` method.

```js
webrtc.joinRoom('room-1');
```

events `createdRoom` and `joinedRoom` will be emitted if join or creation of room was successful. After that `webrtc.gotStream()` can be called to notify server that local stream is ready for sharing.

## webrtc.leaveRoom()

Closes all open connections and leaves the current room. On successful leave event `leftRoom` will be emitted with room ID.

## webrtc.kickUser()

kick user with the given socket id from the call.

```js
webrtc.kickUser(socketId);
```

## Events

As mentioned `Webrtc` instance emits events, which can be listened to with [EventTarget.addEventListener()](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener). Some of the events return data in `event.detail` property.

| Name         | Description                                   | Data                                                                                   |
| ------------ | --------------------------------------------- | -------------------------------------------------------------------------------------- |
| createdRoom  | Successfuly created a room.                   |                                                                                        |
| joinedRoom   | Successfuly joined a room.                    |                                                                                        |
| leftRoom     | Successfuly left a room.                      | **roomId** - ID of the abandoned room                                                  |
| kicked       | You were kicked out of conference.            |                                                                                        |
| userLeave    | User left the conference.                     | **socketId** - socket id of the user that left                                         |
| newUser      | New user joined.                              | **socketId** - socket id of the joined user.<br> **stream** - media stream of new user |
| removeUser   | Connections with user was closed and removed. | **socketId** - socket id of the removed user                                           |
| notification | Notification.                                 | **notification** - notification text                                                   |
| error        | An error occured.                             | **error** - Error object                                                               |

## Getters

| Name         | Description                             |
| ------------ | --------------------------------------- |
| localStream  | Returns local stream.                   |
| myId         | Returns current socket id.              |
| isAdmin      | If current user is admin(created room). |
| roomId       | Returns joined room id.                 |
| participants | Returns participants' ids in room.      |

# Stun and Turn servers

The project uses free stun and turn servers. For production use you might need to consider other alternatives.
<br>
If you want to build your own turn server consider using [coturn server](https://github.com/coturn/coturn).

If you are willing to pay to get these services there are providers who offer them:

-   [Twilio](https://www.twilio.com/stun-turn)
-   [Xirsys](https://xirsys.com/)
-   [Kurento](https://www.kurento.org/)

You might find these articles helpful:

-   https://medium.com/swlh/setup-your-own-coturn-server-using-aws-ec2-instance-29303101e7b5
-   https://kostya-malsev.medium.com/set-up-a-turn-server-on-aws-in-15-minutes-25beb145bc77
-   https://nextcloud-talk.readthedocs.io/en/latest/TURN/

_...more information is being added_

---

## Contributing

If you find any error in code or demo, or have an idea for more optimal solution for the code, please either open an issue or submit a pull request.
Contributions are welcome!

## License

MIT License

Copyright (c) 2021 avoup

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.



docker-compose -f docker-compose.dev.yml down && docker-compose -f docker-compose.dev.yml up --build -d

docker system prune -f

docker-compose -f docker-compose.dev.yml up --build -d

docker-compose -f docker-compose.dev.yml logs -f nginx