// src/components/SortableLinkItem.tsx
'use client';

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FaGripVertical, FaTag } from 'react-icons/fa';
import { LinkData } from '@/lib/pageService';
import Image from 'next/image';

interface Props {
  link: LinkData;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
  editingIndex: number | null;
}

export function SortableLinkItem({ link, index, onEdit, onDelete, editingIndex }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: (link.url || link.title) + index });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
    opacity: isDragging ? 0.5 : 1,
    position: 'relative' as const,
  };

  const isEditing = editingIndex === index;

  if (isEditing) {
    return (
      <div ref={setNodeRef} style={style} className="p-4 bg-orange-50 rounded-md border-2 border-orange-500 mb-4 relative transition-all">
         <div className="flex items-center gap-2 mb-2">
            <span className="text-sm text-orange-700 font-bold bg-orange-100 px-2 py-0.5 rounded">Editando Prato</span>
         </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group p-4 bg-white hover:bg-gray-50 rounded-lg border border-gray-200 shadow-sm hover:shadow-md mb-3 flex items-start sm:items-center gap-3 select-none transition-all duration-200"
    >
      <div 
        {...attributes} 
        {...listeners} 
        className="cursor-grab text-gray-300 hover:text-gray-600 active:cursor-grabbing p-2 rounded hover:bg-gray-100 transition-colors mt-1 sm:mt-0"
      >
        <FaGripVertical size={18} />
      </div>

      {/* Miniatura da Foto do Prato */}
      {link.imageUrl ? (
        <div className="w-12 h-12 relative rounded-md overflow-hidden shrink-0 border border-gray-200">
           <Image src={link.imageUrl} alt={link.title} fill className="object-cover" sizes="48px" />
        </div>
      ) : (
        <div className="w-12 h-12 bg-gray-100 rounded-md flex items-center justify-center text-gray-300 shrink-0">
            <span className="text-xs">Sem foto</span>
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
            <p className="font-bold text-gray-800 truncate text-base">{link.title}</p>
            {link.price && (
                <span className="text-sm font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full w-fit">
                    {link.price}
                </span>
            )}
        </div>
        
        {link.description && (
            <p className="text-xs text-gray-500 line-clamp-1 mt-1">{link.description}</p>
        )}
        
        {/* Mostra ícone se for um link externo (ex: delivery) */}
        {link.url && (
            <div className="flex items-center gap-1 mt-1">
                <FaTag className="text-gray-300 text-[10px]" />
                <span className="text-[10px] text-gray-400 truncate">{link.url}</span>
            </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <button onClick={onEdit} className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md">Editar</button>
        <button onClick={onDelete} className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-md">Excluir</button>
      </div>
    </div>
  );
}