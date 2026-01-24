'use client';

import { useState } from 'react';
import { LeftSidebar } from '@/components/layout/LeftSidebar';
import { RightPanel } from '@/components/layout/RightPanel';
import { ChatArea } from '@/components/chat/ChatArea';
import { NewMeetingDialog } from '@/components/NewMeetingDialog';

export default function Home() {
  const [showNewMeetingDialog, setShowNewMeetingDialog] = useState(false);

  return (
    <main className="h-screen w-screen flex overflow-hidden bg-zinc-950">
      {/* Left Sidebar - Navigation */}
      <LeftSidebar onNewMeeting={() => setShowNewMeetingDialog(true)} />

      {/* Center - Chat Area */}
      <ChatArea />

      {/* Right Panel - Context */}
      <RightPanel />

      {/* New Meeting Dialog */}
      <NewMeetingDialog
        isOpen={showNewMeetingDialog}
        onClose={() => setShowNewMeetingDialog(false)}
      />
    </main>
  );
}
