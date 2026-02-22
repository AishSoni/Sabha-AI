'use client';

import Link from 'next/link';
import { Users, MessageSquare, Settings, ArrowRight, Sparkles, BookOpen } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-800/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Sabha</h1>
              <p className="text-xs text-zinc-500">AI Advisory Board</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 py-12">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-white mb-3">
            Welcome to Sabha
          </h2>
          <p className="text-zinc-400 max-w-xl mx-auto">
            Assemble your AI advisory board and get diverse perspectives on any topic.
            Create meeting rooms, invite AI personas, and facilitate insightful discussions.
          </p>
        </div>

        {/* Navigation Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Meeting Space */}
          <Link href="/meetings" className="group">
            <Card className="bg-zinc-900/50 border-zinc-800 hover:border-indigo-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-indigo-500/10 h-full">
              <CardHeader>
                <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center mb-4 group-hover:bg-indigo-500/30 transition-colors">
                  <MessageSquare className="w-6 h-6 text-indigo-400" />
                </div>
                <CardTitle className="text-white flex items-center justify-between">
                  Meeting Space
                  <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all" />
                </CardTitle>
                <CardDescription className="text-zinc-400">
                  Create and manage your AI meeting rooms
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-zinc-500">
                  Start new discussions, review past meetings, and collaborate with your AI advisory board.
                </p>
              </CardContent>
            </Card>
          </Link>

          {/* AI Roster */}
          <Link href="/roster" className="group">
            <Card className="bg-zinc-900/50 border-zinc-800 hover:border-emerald-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-emerald-500/10 h-full">
              <CardHeader>
                <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center mb-4 group-hover:bg-emerald-500/30 transition-colors">
                  <Users className="w-6 h-6 text-emerald-400" />
                </div>
                <CardTitle className="text-white flex items-center justify-between">
                  AI Roster
                  <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-emerald-400 group-hover:translate-x-1 transition-all" />
                </CardTitle>
                <CardDescription className="text-zinc-400">
                  Manage your AI personas and advisors
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-zinc-500">
                  Create custom AI personalities, configure their expertise, and build your dream advisory team.
                </p>
              </CardContent>
            </Card>
          </Link>

          {/* Knowledge Stacks */}
          <Link href="/knowledge-stacks" className="group">
            <Card className="bg-zinc-900/50 border-zinc-800 hover:border-blue-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/10 h-full">
              <CardHeader>
                <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center mb-4 group-hover:bg-blue-500/30 transition-colors">
                  <BookOpen className="w-6 h-6 text-blue-400" />
                </div>
                <CardTitle className="text-white flex items-center justify-between">
                  Knowledge Stacks
                  <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-blue-400 group-hover:translate-x-1 transition-all" />
                </CardTitle>
                <CardDescription className="text-zinc-400">
                  Curate document collections for RAG
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-zinc-500">
                  Upload and manage custom knowledge domains to power your AI advisors with exact context.
                </p>
              </CardContent>
            </Card>
          </Link>

          {/* Settings */}
          <Link href="/settings" className="group">
            <Card className="bg-zinc-900/50 border-zinc-800 hover:border-amber-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-amber-500/10 h-full">
              <CardHeader>
                <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center mb-4 group-hover:bg-amber-500/30 transition-colors">
                  <Settings className="w-6 h-6 text-amber-400" />
                </div>
                <CardTitle className="text-white flex items-center justify-between">
                  Settings
                  <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-amber-400 group-hover:translate-x-1 transition-all" />
                </CardTitle>
                <CardDescription className="text-zinc-400">
                  Configure your Sabha experience
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-zinc-500">
                  API keys, default models, appearance preferences, and more.
                </p>
              </CardContent>
            </Card>
          </Link>

        </div>
      </main>
    </div>
  );
}
