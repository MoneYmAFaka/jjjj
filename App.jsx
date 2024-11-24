// src/App.jsx
import React, { useState, useRef, useEffect } from 'react';
import { Camera, Mic, MicOff, Video, VideoOff, UserPlus, MessageSquare, X } from 'lucide-react';

const VideoChat = () => {
  const [status, setStatus] = useState('disconnected');
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isChatOpen, setIsChatOpen] = useState(true);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const wsRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);

  const configuration = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  };

  useEffect(() => {
    initializeMedia();
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const initializeMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
    } catch (error) {
      console.error('Error accessing media devices:', error);
      setStatus('media error');
    }
  };

  const connectWebSocket = () => {
    wsRef.current = new WebSocket(`ws://${window.location.host}`);
    
    wsRef.current.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      handleWebSocketMessage(data);
    };

    wsRef.current.onclose = () => {
      setStatus('disconnected');
    };

    wsRef.current.onopen = () => {
      wsRef.current.send(JSON.stringify({ type: 'find_partner' }));
      setStatus('searching');
    };
  };

  const handleWebSocketMessage = async (data) => {
    switch (data.type) {
      case 'partner_found':
        setStatus('connected');
        createPeerConnection();
        const offer = await peerConnectionRef.current.createOffer();
        await peerConnectionRef.current.setLocalDescription(offer);
        wsRef.current.send(JSON.stringify({
          type: 'video_offer',
          sdp: offer
        }));
        break;

      case 'video_offer':
        createPeerConnection();
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
        const answer = await peerConnectionRef.current.createAnswer();
        await peerConnectionRef.current.setLocalDescription(answer);
        wsRef.current.send(JSON.stringify({
          type: 'video_answer',
          sdp: answer
        }));
        break;

      case 'video_answer':
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
        break;

      case 'ice_candidate':
        if (peerConnectionRef.current) {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
        break;

      case 'partner_disconnected':
        handleDisconnection();
        break;

      case 'chat_message':
        setMessages(prev => [...prev, { text: data.message, isUser: false }]);
        break;
    }
  };

  const createPeerConnection = () => {
    peerConnectionRef.current = new RTCPeerConnection(configuration);
    
    localStreamRef.current.getTracks().forEach(track => {
      peerConnectionRef.current.addTrack(track, localStreamRef.current);
    });

    peerConnectionRef.current.onicecandidate = (event) => {
      if (event.candidate && wsRef.current) {
        wsRef.current.send(JSON.stringify({
          type: 'ice_candidate',
          candidate: event.candidate
        }));
      }
    };

    peerConnectionRef.current.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };
  };

  const handleDisconnection = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    setStatus('disconnected');
    setMessages([]);
  };

  const startNewChat = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    connectWebSocket();
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(track => {
        track.enabled = !isVideoEnabled;
      });
      setIsVideoEnabled(!isVideoEnabled);
    }
  };

  const toggleAudio = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !isAudioEnabled;
      });
      setIsAudioEnabled(!isAudioEnabled);
    }
  };

  const sendMessage = () => {
    if (message.trim() && wsRef.current) {
      wsRef.current.send(JSON.stringify({
        type: 'chat_message',
        message: message.trim()
      }));
      setMessages(prev => [...prev, { text: message.trim(), isUser: true }]);
      setMessage('');
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold">Random Video Chat</h1>
            <span className="px-4 py-2 rounded-full bg-gray-200">
              Status: {status}
            </span>
          </div>

          <div className="flex gap-4">
            {/* Video Container */}
            <div className="flex-1">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-2 left-2 text-white text-sm">You</div>
                </div>
                <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-2 left-2 text-white text-sm">Stranger</div>
                </div>
              </div>

              {/* Controls */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={startNewChat}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                >
                  <UserPlus size={20} />
                  New Chat
                </button>
                <button
                  onClick={toggleVideo}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                    isVideoEnabled ? 'bg-gray-200 hover:bg-gray-300' : 'bg-red-500 text-white hover:bg-red-600'
                  }`}
                >
                  {isVideoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
                </button>
                <button
                  onClick={toggleAudio}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                    isAudioEnabled ? 'bg-gray-200 hover:bg-gray-300' : 'bg-red-500 text-white hover:bg-red-600'
                  }`}
                >
                  {isAudioEnabled ? <Mic size={20} /> : <MicOff size={20} />}
                </button>
                <button
                  onClick={() => setIsChatOpen(!isChatOpen)}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300"
                >
                  <MessageSquare size={20} />
                </button>
              </div>
            </div>

            {/* Chat Container */}
            {isChatOpen && (
              <div className="w-80 flex flex-col bg-gray-50 rounded-lg">
                <div className="flex justify-between items-center p-4 border-b">
                  <h2 className="font-semibold">Chat</h2>
                  <button
                    onClick={() => setIsChatOpen(false)}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className="flex-1 p-4 overflow-y-auto max-h-[400px]">
                  {messages.map((msg, index) => (
                    <div
                      key={index}
                      className={`mb-2 p-2 rounded-lg ${
                        msg.isUser
                          ? 'bg-blue-500 text-white ml-auto'
                          : 'bg-gray-200 mr-auto'
                      } max-w-[80%]`}
                    >
                      {msg.text}
                    </div>
                  ))}
                </div>
                <div className="p-4 border-t">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                      placeholder="Type a message..."
                      className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={sendMessage}
                      className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                    >
                      Send
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoChat;