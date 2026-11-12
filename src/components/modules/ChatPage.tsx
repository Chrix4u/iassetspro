'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
import type { User } from '@/types';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ResponsiveDialog } from '@/components/shared/ResponsiveDialog';;
import {
  Search, Send, Plus, MessageSquare, X, Users,
  ArrowLeft,
} from 'lucide-react';
import { toast } from 'sonner';
import { getInitials, formatDateTime, timeAgo } from '@/components/shared/helpers';

export function ChatPage() {
  const { user } = useAuthStore();
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingConv, setLoadingConv] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState(false);
  const [showNewConv, setShowNewConv] = useState(false);
  const [searchUsers, setSearchUsers] = useState('');
  const [userResults, setUserResults] = useState<{ id: string; name: string; username: string }[]>([]);
  const [hasMore, setHasMore] = useState(false);

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    try {
      const res = await api.get<ChatConversation[]>('/api/chat/conversations');
      if (res.success && res.data) {
        setConversations(res.data);
      }
    } catch (err: any) {
      console.error('[Chat] Failed to load conversations:', err);
    } finally {
      setLoadingConv(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
    const interval = setInterval(fetchConversations, 10000);
    return () => clearInterval(interval);
  }, [fetchConversations]);

  // Fetch messages for active conversation
  const fetchMessages = useCallback(async (convId: string) => {
    setLoadingMsg(true);
    try {
      const res = await api.get<{ messages: ChatMessage[]; hasMore: boolean }>(`/api/chat/conversations/${convId}/messages?limit=50`);
      if (res.success && res.data) {
        setMessages(res.data.messages || []);
        setHasMore(res.data.hasMore || false);
      }
    } catch (err: any) {
      console.error('[Chat] Failed to load messages:', err);
      setMessages([]);
    } finally {
      setLoadingMsg(false);
    }
  }, []);

  useEffect(() => {
    if (activeConvId) {
      fetchMessages(activeConvId);
      const interval = setInterval(() => fetchMessages(activeConvId), 5000);
      return () => clearInterval(interval);
    }
  }, [activeConvId, fetchMessages]);

  // Mark as read
  const markAsRead = useCallback(async (convId: string) => {
    try {
      await api.post(`/api/chat/conversations/${convId}/read`);
    } catch (err: any) {
      console.error('[Chat] Failed to mark as read:', err);
    }
  }, []);

  // When selecting a conversation, mark as read
  useEffect(() => {
    if (activeConvId) {
      markAsRead(activeConvId);
      setConversations(prev => prev.map(c =>
        c.id === activeConvId ? { ...c, unreadCount: 0 } : c
      ));
    }
  }, [activeConvId, markAsRead]);

  // Send message
  const sendMessage = async () => {
    if (!newMessage.trim() || !activeConvId || sending) return;
    setSending(true);
    try {
      const res = await api.post('/api/chat/conversations/' + activeConvId + '/messages', {
        content: newMessage.trim(),
        messageType: 'text',
      });
      if (res.success) {
        setNewMessage('');
        fetchMessages(activeConvId);
        fetchConversations();
      } else {
        toast.error(res.error || 'Failed to send message');
      }
    } catch (err: any) {
      console.error('[Chat] Send error:', err);
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  // Create new conversation
  const createConversation = async (targetUserId: string) => {
    try {
      const res = await api.post('/api/chat/conversations', {
        participantIds: [targetUserId],
        type: 'direct',
      });
      if (res.success) {
        setShowNewConv(false);
        setSearchUsers('');
        setUserResults([]);
        fetchConversations();
        if (res.data && (res.data as any).id) {
          setActiveConvId((res.data as any).id);
        }
      } else {
        toast.error(res.error || 'Failed to create conversation');
      }
    } catch (err: any) {
      console.error('[Chat] Create conversation error:', err);
      toast.error('Failed to create conversation');
    }
  };

  // Search users
  const searchForUsers = useCallback(async (query: string) => {
    setSearchUsers(query);
    if (query.length < 2) {
      setUserResults([]);
      return;
    }
    try {
      const res = await api.get('/api/chat/users?search=' + encodeURIComponent(query));
      if (res.success && res.data) {
        setUserResults(res.data.filter((u: any) => u.id !== user?.id));
      }
    } catch (err: any) {
      console.error('[Chat] User search error:', err);
    }
  }, [user?.id]);

  const activeConv = conversations.find(c => c.id === activeConvId);

  // Group messages by date
  const groupedMessages: { date: string; messages: ChatMessage[] }[] = [];
  let currentDate = '';
  for (const msg of messages) {
    const msgDate = msg.createdAt ? new Date(msg.createdAt).toLocaleDateString() : 'Today';
    if (msgDate !== currentDate) {
      currentDate = msgDate;
      groupedMessages.push({ date: msgDate, messages: [msg] });
    } else {
      groupedMessages[groupedMessages.length - 1].messages.push(msg);
    }
  }

  function formatChatTime(d?: string) {
    if (!d) return '';
    const date = new Date(d);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* Conversation List */}
      <div className={`${activeConvId ? 'hidden md:flex' : 'flex'} w-full md:w-80 flex-col border-r border-border`}>
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Messages</h2>
            <Button size="sm" onClick={() => setShowNewConv(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> New
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingConv ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center gap-3 p-2">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="space-y-1.5 flex-1">
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="h-3 w-36" />
                  </div>
                </div>
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <MessageSquare className="h-8 w-8 text-muted-foreground mb-3" />
              <p className="text-sm font-medium">No conversations yet</p>
              <p className="text-xs text-muted-foreground mt-1">Start a new conversation</p>
            </div>
          ) : (
            conversations.map(conv => (
              <button
                key={conv.id}
                onClick={() => setActiveConvId(conv.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors border-b border-border/50 ${activeConvId === conv.id ? 'bg-muted' : ''}`}
              >
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-emerald-100 text-emerald-700 text-xs font-semibold">
                    {getInitials(conv.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium truncate">{conv.name}</span>
                    <span className="text-[10px] text-muted-foreground flex-shrink-0 ml-2">
                      {conv.lastMessage ? formatChatTime(conv.lastMessage.createdAt) : ''}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground truncate">
                      {conv.lastMessage
                        ? (conv.lastMessage.senderId === user?.id ? 'You: ' : '') + conv.lastMessage.content
                        : 'No messages yet'}
                    </p>
                    {conv.unreadCount > 0 && (
                      <Badge className="bg-emerald-500 text-white text-[10px] h-4 px-1.5 flex-shrink-0 ml-2">
                        {conv.unreadCount}
                      </Badge>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Message Area */}
      <div className={`${activeConvId ? 'flex' : 'hidden md:flex'} flex-1 flex-col`}>
        {activeConvId && activeConv ? (
          <>
            {/* Header */}
            <div className="h-14 border-b border-border flex items-center px-4 gap-3 shrink-0">
              <button className="md:hidden p-1" onClick={() => setActiveConvId(null)}>
                <ArrowLeft className="h-5 w-5" />
              </button>
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-emerald-100 text-emerald-700 text-xs font-semibold">
                  {getInitials(activeConv.name)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-semibold">{activeConv.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {activeConv.participants?.filter(p => p.userId !== user?.id).map(p => p.name).join(', ') || 'Direct message'}
                </p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-1">
              {loadingMsg ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
                      <Skeleton className="h-10 w-48 rounded-2xl" />
                    </div>
                  ))}
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <MessageSquare className="h-10 w-10 text-muted-foreground mb-3" />
                  <p className="text-sm font-medium">No messages</p>
                  <p className="text-xs text-muted-foreground mt-1">Send the first message</p>
                </div>
              ) : (
                groupedMessages.map((group, gi) => (
                  <div key={gi}>
                    <div className="flex items-center justify-center my-3">
                      <span className="text-[10px] text-muted-foreground bg-muted px-3 py-1 rounded-full">
                        {group.date}
                      </span>
                    </div>
                    {group.messages.map(msg => {
                      const isMe = msg.senderId === user?.id;
                      return (
                        <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} mb-1`}>
                          {!isMe && (
                            <Avatar className="h-7 w-7 mr-2 mt-1">
                              <AvatarFallback className="bg-slate-100 text-slate-600 text-[10px]">
                                {getInitials(msg.senderName || '')}
                              </AvatarFallback>
                            </Avatar>
                          )}
                          <div className={`max-w-[70%] px-3.5 py-2 rounded-2xl text-sm ${
                            isMe
                              ? 'bg-emerald-500 text-white rounded-br-md'
                              : 'bg-muted rounded-bl-md'
                          }`}>
                            <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                            <p className={`text-[10px] mt-1 ${isMe ? 'text-emerald-100' : 'text-muted-foreground'}`}>
                              {formatChatTime(msg.createdAt)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            {/* Input */}
            <div className="border-t border-border p-3">
              <div className="flex items-center gap-2">
                <Input
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  placeholder="Type a message..."
                  className="flex-1"
                />
                <Button size="sm" onClick={sendMessage} disabled={sending || !newMessage.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <h3 className="text-sm font-semibold">Select a conversation</h3>
              <p className="text-xs text-muted-foreground mt-1">Choose from your existing conversations or start a new one</p>
            </div>
          </div>
        )}
      </div>

      {/* New Conversation Dialog */}
      <ResponsiveDialog open={showNewConv} onOpenChange={setShowNewConv}>
        
          <div className="space-y-1.5 mb-4">
            <h2 className="text-lg font-semibold leading-none tracking-tight">New Conversation</h2>
            <p className="text-sm text-muted-foreground">Search for a user to start a conversation</p>
          </div>
          <div className="space-y-3">
            <Input
              value={searchUsers}
              onChange={e => searchForUsers(e.target.value)}
              placeholder="Search by name or username..."
              autoFocus
            />
            <div className="max-h-60 overflow-y-auto">
              {userResults.length === 0 && searchUsers.length >= 2 && (
                <p className="text-sm text-muted-foreground text-center py-4">No users found</p>
              )}
              {userResults.map(u => (
                <button
                  key={u.id}
                  onClick={() => createConversation(u.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted transition-colors"
                >
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-emerald-100 text-emerald-700 text-xs font-semibold">
                      {getInitials(u.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="text-left">
                    <p className="text-sm font-medium">{u.name}</p>
                    <p className="text-xs text-muted-foreground">@{u.username}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        
      </ResponsiveDialog>
    </div>
  );
}

// ============================================================================
// MAIN APP SHELL
// ============================================================================

