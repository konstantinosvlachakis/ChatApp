// src/components/ConversationList.js
import React from 'react';
import ConversationItem from './ConversationItem';
import { conversations } from '../data/conversations';

function ConversationList() {
  return (
    <div className="flex-1 overflow-y-auto">
      {conversations.map(convo => (
        <ConversationItem key={convo.id} conversation={convo} />
      ))}
    </div>
  );
}

export default ConversationList;
