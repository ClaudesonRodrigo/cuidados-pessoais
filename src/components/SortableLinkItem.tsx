'use client';

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FaGripVertical, FaEdit, FaTrash, FaImage } from 'react-icons/fa';
import Image from 'next/image';
import { LinkData } from '@/lib/pageService';

interface Props {
  id: string; // <--- ADICIONADO: Agora aceita o ID único do pai
  link: LinkData;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
  editingIndex: number | null;
}

export function SortableLinkItem({ id, link, index, onEdit, onDelete, editingIndex }: Props) {
  // Agora usamos o 'id' que veio do pai, garantindo que seja igual
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ 
    id: id 
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div 
        ref={setNodeRef} 
        style={style} 
        className="bg-white border border-gray-200 rounded-xl p-3 flex items-center gap-3 shadow-sm group hover:border-orange-300 transition-all select-none touch-manipulation"
    >
      {/* 1. Alça de Arrastar (Drag Handle) */}
      <div {...attributes} {...listeners} className="text-gray-300 cursor-grab active:cursor-grabbing hover:text-orange-500 p-1 shrink-0">
        <FaGripVertical size={16} />
      </div>

      {/* 2. Imagem do Produto */}
      <div className="w-12 h-12 bg-gray-50 rounded-lg relative overflow-hidden shrink-0 border border-gray-100">
        {link.imageUrl ? (
            <Image 
              src={link.imageUrl} 
              alt={link.title} 
              fill 
              className="object-cover" 
              sizes="48px" 
            />
        ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-300">
                <FaImage size={14} />
            </div>
        )}
      </div>

      {/* 3. Conteúdo (Título + Preço + Descrição) */}
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        
        {/* Linha Superior: Título e Preço */}
        <div className="flex justify-between items-start gap-2">
            <h4 className="font-bold text-gray-800 text-sm truncate leading-tight">
                {link.title}
            </h4>
            
            {link.price && (
                <span className="text-xs font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded-full whitespace-nowrap shrink-0 border border-green-100">
                    R$ {link.price}
                </span>
            )}
        </div>

        {/* Linha Inferior: Descrição ou Categoria */}
        <p className="text-xs text-gray-400 truncate mt-0.5">
            {link.description || link.category || "Sem descrição"}
        </p>
      </div>

      {/* 4. Botões de Ação */}
      <div className="flex gap-1 shrink-0 pl-1 border-l border-gray-100 ml-1">
        <button 
            onClick={(e) => { e.stopPropagation(); onEdit(); }} 
            className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition active:scale-95"
            title="Editar"
        >
            <FaEdit size={16} />
        </button>
        <button 
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition active:scale-95"
            title="Excluir"
        >
            <FaTrash size={16} />
        </button>
      </div>
    </div>
  );
}