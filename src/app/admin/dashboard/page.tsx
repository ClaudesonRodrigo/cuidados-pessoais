// src/app/admin/dashboard/page.tsx
'use client';

import React, { useEffect, useState, FormEvent, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { signOutUser } from '@/lib/authService';
import {
  getPageDataForUser, addLinkToPage, deleteLinkFromPage, updateLinksOnPage,
  updatePageTheme, updatePageBackground, updateProfileImage, updatePageProfileInfo,
  PageData, LinkData, UserData, findUserByEmail, updateUserPlan
} from '@/lib/pageService';
import { FaLock, FaSearch, FaCamera, FaUserCog, FaArrowLeft, FaImage, FaSave, FaQrcode, FaChartLine, FaUtensils, FaPlus, FaTrash } from 'react-icons/fa';
import Image from 'next/image';

import { 
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent 
} from '@dnd-kit/core';
import { 
  arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy 
} from '@dnd-kit/sortable';
import { SortableLinkItem } from '@/components/SortableLinkItem';
import { QRCodeCanvas } from 'qrcode.react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const CLOUDINARY_CLOUD_NAME = "dhzzvc3vl"; 
const CLOUDINARY_UPLOAD_PRESET = "links-page-pro"; 

const themes = [
  { name: 'restaurant', label: 'Restaurante Clássico', colorClass: 'bg-red-900', isPro: false }, // Liberei para teste
  { name: 'light', label: 'Clean (Branco)', colorClass: 'bg-gray-100', isPro: false },
  { name: 'dark', label: 'Moderno (Escuro)', colorClass: 'bg-gray-900', isPro: false },
  { name: 'mechanic', label: 'Industrial', colorClass: 'bg-slate-800 border-l-4 border-cyan-500', isPro: true },
  { name: 'realtor', label: 'Luxo (Dourado)', colorClass: 'bg-neutral-900 border border-yellow-600', isPro: true },
];

export default function DashboardPage() {
  const { user, userData, loading } = useAuth();
  const router = useRouter();
  
  const [pageData, setPageData] = useState<PageData | null>(null);
  const [pageSlug, setPageSlug] = useState<string | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);

  // Estados de Prato/Item
  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newItemDesc, setNewItemDesc] = useState('');
  const [newItemImage, setNewItemImage] = useState('');
  const [isUploadingItemImg, setIsUploadingItemImg] = useState(false);

  // Edição
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editItemTitle, setEditItemTitle] = useState('');
  const [editItemPrice, setEditItemPrice] = useState('');
  const [editItemDesc, setEditItemDesc] = useState('');
  const [editItemImage, setEditItemImage] = useState('');

  // Perfil
  const [editingProfileTitle, setEditingProfileTitle] = useState('');
  const [editingProfileBio, setEditingProfileBio] = useState('');
  const [isUploadingProfile, setIsUploadingProfile] = useState(false);
  const [isUploadingBg, setIsUploadingBg] = useState(false);
  
  const [showQRCode, setShowQRCode] = useState(false);
  const [copyButtonText, setCopyButtonText] = useState('Copiar Link');

  // Admin
  const isAdmin = userData?.role === 'admin';
  const [targetUserId, setTargetUserId] = useState<string | null>(null);
  const [targetUserEmail, setTargetUserEmail] = useState<string | null>(null);
  const [searchEmail, setSearchEmail] = useState('');
  const [foundUser, setFoundUser] = useState<(UserData & { uid: string }) | null>(null);
  const [adminMessage, setAdminMessage] = useState<string | null>(null);
  
  // --- AQUI ESTAVA O ERRO: Adicionando os estados que faltavam ---
  const [isSearching, setIsSearching] = useState(false);
  const [isUpdatingPlan, setIsUpdatingPlan] = useState(false);
  // -------------------------------------------------------------

  const isProPlan = targetUserId ? true : (userData?.plan === 'pro');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const uploadToCloudinary = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    formData.append('cloud_name', CLOUDINARY_CLOUD_NAME);
    try {
      const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
        method: 'POST', body: formData,
      });
      if (!response.ok) throw new Error('Falha no upload');
      const data = await response.json();
      return data.secure_url;
    } catch (error) { throw error; }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id && pageData?.links) {
      setPageData((prev) => {
        if (!prev) return null;
        const oldIndex = prev.links.findIndex((link, idx) => (link.url || link.title) + idx === active.id);
        const newIndex = prev.links.findIndex((link, idx) => (link.url || link.title) + idx === over.id);
        const newLinks = arrayMove(prev.links, oldIndex, newIndex);
        const reorderedLinks = newLinks.map((link, index) => ({ ...link, order: index + 1 }));
        if (pageSlug) updateLinksOnPage(pageSlug, reorderedLinks);
        return { ...prev, links: reorderedLinks };
      });
    }
  };

  const fetchPageData = useCallback(async () => {
    const idToFetch = targetUserId || user?.uid;
    if (idToFetch) {
      setIsLoadingData(true);
      const result = await getPageDataForUser(idToFetch);
      if (result) {
        const data = result.data as PageData;
        if (data.links) data.links.sort((a, b) => (a.order || 0) - (b.order || 0));
        setPageData(data);
        setPageSlug(result.slug);
        setEditingProfileTitle(data.title || '');
        setEditingProfileBio(data.bio || '');
      } else {
        setPageData(null);
      }
      setIsLoadingData(false);
    } else {
      setIsLoadingData(false);
    }
  }, [user, targetUserId]);

  useEffect(() => { if (!loading && user) fetchPageData(); }, [user, loading, fetchPageData]);
  useEffect(() => { if (!loading && !user) router.push('/admin/login'); }, [user, loading, router]);

  const handleLogout = () => signOutUser();
  const handleManageUser = (uid: string, email: string | undefined) => {
    setTargetUserId(uid);
    setTargetUserEmail(email || 'Cliente');
    setAdminMessage(null); setFoundUser(null); setSearchEmail('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const handleExitAdminMode = () => { setTargetUserId(null); setTargetUserEmail(null); };

  const handleAddItem = async (e: FormEvent) => {
    e.preventDefault();
    if (!pageSlug || !newItemTitle) { alert("O nome do prato é obrigatório."); return; }
    
    const currentLinks = pageData?.links || [];
    const newOrder = currentLinks.length > 0 ? Math.max(...currentLinks.map(l => l.order)) + 1 : 1;

    const newItem: LinkData = {
      title: newItemTitle,
      url: '', // URL vazia se for só item de menu
      type: "dish",
      order: newOrder,
      clicks: 0,
      price: newItemPrice,
      description: newItemDesc,
      imageUrl: newItemImage
    };

    try {
      await addLinkToPage(pageSlug, newItem);
      setNewItemTitle(''); setNewItemPrice(''); setNewItemDesc(''); setNewItemImage('');
      await fetchPageData();
    } catch (error) { alert("Erro ao adicionar prato."); }
  };

  const handleUpdateItem = async (index: number) => {
    if (!pageSlug || !pageData || !pageData.links) return;
    const updatedLinks = [...pageData.links];
    updatedLinks[index] = {
      ...updatedLinks[index],
      title: editItemTitle,
      price: editItemPrice,
      description: editItemDesc,
      imageUrl: editItemImage
    };
    try {
      await updateLinksOnPage(pageSlug, updatedLinks);
      setEditingIndex(null);
      await fetchPageData();
    } catch (error) { alert("Erro ao atualizar."); }
  };

  const handleDeleteLink = async (link: LinkData) => {
    if (!window.confirm("Excluir este item?")) return;
    if (!pageSlug) return;
    try { await deleteLinkFromPage(pageSlug, link); await fetchPageData(); } catch { alert("Erro ao excluir."); }
  };

  const handleEditClick = (link: LinkData, index: number) => {
    setEditingIndex(index);
    setEditItemTitle(link.title);
    setEditItemPrice(link.price || '');
    setEditItemDesc(link.description || '');
    setEditItemImage(link.imageUrl || '');
  };

  const handleItemImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, isNew: boolean) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingItemImg(true);
    try {
      const url = await uploadToCloudinary(file);
      if (isNew) setNewItemImage(url); else setEditItemImage(url);
    } catch { alert("Erro no upload da imagem do prato."); } 
    finally { setIsUploadingItemImg(false); }
  };

  const handleProfileImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !pageSlug) return;
    setIsUploadingProfile(true);
    try {
      const url = await uploadToCloudinary(file);
      await updateProfileImage(pageSlug, url);
      setPageData(prev => prev ? { ...prev, profileImageUrl: url } : null);
    } catch { alert("Erro no upload."); } finally { setIsUploadingProfile(false); }
  };

  const handleBackgroundImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !pageSlug) return;
    if (!isProPlan) { alert("Fundo personalizado é Pro!"); return; }
    setIsUploadingBg(true);
    try {
      const url = await uploadToCloudinary(file);
      await updatePageBackground(pageSlug, url);
      setPageData(prev => prev ? { ...prev, backgroundImage: url } : null);
    } catch { alert("Erro no upload."); } finally { setIsUploadingBg(false); }
  };

  const handleSaveProfileInfo = async () => {
      if (!pageSlug) return;
      try {
          await updatePageProfileInfo(pageSlug, editingProfileTitle, editingProfileBio);
          setPageData(prev => prev ? { ...prev, title: editingProfileTitle, bio: editingProfileBio } : null);
          alert("Perfil salvo!");
      } catch { alert("Erro ao salvar."); }
  };

  const handleCopyUrl = () => {
      if (!pageSlug) return;
      const url = `${window.location.origin}/${pageSlug}`;
      navigator.clipboard.writeText(url);
      setCopyButtonText("Copiado!");
      setTimeout(() => setCopyButtonText("Copiar Link"), 2000);
  };

  const handleThemeChange = async (themeName: string) => {
      if (!pageSlug) return;
      try { await updatePageTheme(pageSlug, themeName); setPageData(prev => prev ? { ...prev, theme: themeName } : null); }
      catch { alert("Erro ao mudar tema."); }
  };

  const handleSearchUser = async (e: FormEvent) => {
      e.preventDefault(); if(!searchEmail) return;
      setIsSearching(true); setAdminMessage(null); setFoundUser(null);
      const user = await findUserByEmail(searchEmail);
      if(user) setFoundUser(user); else setAdminMessage("Não encontrado.");
      setIsSearching(false);
  };

  const handleChangePlan = async (newPlan: 'free' | 'pro') => {
      if(!foundUser) return;
      setIsUpdatingPlan(true);
      try { await updateUserPlan(foundUser.uid, newPlan); setFoundUser(prev => prev ? {...prev, plan: newPlan} : null); setAdminMessage("Plano atualizado!"); }
      catch { setAdminMessage("Erro ao atualizar plano."); }
      finally { setIsUpdatingPlan(false); }
  };

  if (loading || (!isAdmin && isLoadingData)) return <div className="flex items-center justify-center min-h-screen bg-gray-100">Carregando...</div>;
  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {targetUserId && (
        <div className="bg-red-600 text-white px-4 py-3 sticky top-0 z-50 flex justify-between items-center shadow-md">
            <span className="font-bold flex items-center gap-2"><FaUserCog/> Editando: {targetUserEmail}</span>
            <button onClick={handleExitAdminMode} className="bg-white text-red-600 px-3 py-1 rounded-full text-sm font-bold flex items-center gap-1"><FaArrowLeft/> Sair</button>
        </div>
      )}

      <nav className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-16 flex justify-between items-center">
            <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2"><FaUtensils className="text-orange-500"/> Gestor de Cardápio</h1>
            <button onClick={handleLogout} className="text-red-600 font-medium text-sm hover:text-red-800">Sair</button>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto py-8 px-4 space-y-6">
        
        {/* CABEÇALHO DO RESTAURANTE */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row items-center gap-6">
            <div className="relative group shrink-0">
                <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-orange-100 shadow-inner bg-gray-100 relative">
                    {pageData?.profileImageUrl ? (
                        <Image src={pageData.profileImageUrl} alt="Logo" fill className="object-cover" />
                    ) : (
                        <FaCamera className="text-gray-300 w-8 h-8 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                    )}
                </div>
                <label className="absolute bottom-0 right-0 bg-orange-500 text-white p-2 rounded-full cursor-pointer hover:bg-orange-600 shadow-md">
                    <FaCamera size={12} />
                    <input type="file" className="hidden" accept="image/*" onChange={handleProfileImageUpload} disabled={isUploadingProfile} />
                </label>
                {isUploadingProfile && <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center"><div className="animate-spin w-6 h-6 border-2 border-white border-t-transparent rounded-full"/></div>}
            </div>
            
            <div className="flex-1 w-full space-y-3">
                <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">Nome do Restaurante</label>
                    <input type="text" value={editingProfileTitle} onChange={(e) => setEditingProfileTitle(e.target.value)} className="w-full border-b border-gray-300 focus:border-orange-500 outline-none py-1 text-lg font-semibold bg-transparent" placeholder="Ex: Pizzaria do João" />
                </div>
                <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">Descrição / Horário</label>
                    <textarea value={editingProfileBio} onChange={(e) => setEditingProfileBio(e.target.value)} rows={2} className="w-full border rounded-md border-gray-300 focus:border-orange-500 outline-none p-2 text-sm bg-transparent resize-none" placeholder="Ex: A melhor pizza da cidade. Aberto das 18h às 23h." />
                </div>
                <button onClick={handleSaveProfileInfo} className="bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-orange-700 transition self-start"><FaSave/> Salvar Dados</button>
            </div>
        </div>

        {/* QR CODE E LINK */}
        {pageSlug && (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col sm:flex-row gap-4 items-center justify-between bg-gradient-to-r from-orange-50 to-white">
                <div className="flex-1">
                    <h3 className="font-bold text-gray-800">Seu Cardápio Digital</h3>
                    <p className="text-sm text-gray-500 mb-2">Compartilhe ou imprima o QR Code para as mesas.</p>
                    <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg p-2 max-w-md">
                        <span className="text-xs text-gray-500 truncate flex-1">{window.location.origin}/{pageSlug}</span>
                        <button onClick={handleCopyUrl} className="text-xs font-bold text-orange-600 hover:text-orange-800 px-2">{copyButtonText}</button>
                    </div>
                </div>
                <button onClick={() => setShowQRCode(!showQRCode)} className="bg-gray-800 text-white px-4 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-gray-900 shadow-lg">
                    <FaQrcode /> {showQRCode ? 'Ocultar QR' : 'Ver QR Code'}
                </button>
            </div>
        )}

        {showQRCode && pageSlug && (
            <div className="flex justify-center bg-white p-8 rounded-xl shadow-lg border border-gray-100 animate-in fade-in zoom-in duration-300">
                <div className="text-center">
                    <div className="bg-white p-4 rounded-xl border-2 border-gray-100 inline-block mb-4">
                         <QRCodeCanvas value={`${window.location.origin}/${pageSlug}`} size={200} level="H" />
                    </div>
                    <p className="text-sm font-bold text-gray-800">Aponte a câmera do celular</p>
                </div>
            </div>
        )}

        {/* ADICIONAR NOVO PRATO */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><FaPlus className="text-green-500"/> Novo Item do Cardápio</h3>
            <form onSubmit={handleAddItem} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4">
                    {/* Upload de Imagem do Prato */}
                    <div className="w-24 h-24 bg-gray-100 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center relative cursor-pointer hover:bg-gray-50 transition shrink-0 group">
                        {newItemImage ? (
                            <Image src={newItemImage} alt="Prato" fill className="object-cover rounded-lg" />
                        ) : (
                            <div className="text-center text-gray-400">
                                <FaCamera className="mx-auto mb-1"/>
                                <span className="text-[10px]">FOTO</span>
                            </div>
                        )}
                        <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => handleItemImageUpload(e, true)} disabled={isUploadingItemImg} />
                        {isUploadingItemImg && <div className="absolute inset-0 bg-white/80 flex items-center justify-center"><div className="animate-spin w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full"/></div>}
                        {newItemImage && <button type="button" onClick={(e) => {e.preventDefault(); setNewItemImage('')}} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition"><FaTrash size={10}/></button>}
                    </div>

                    <div className="space-y-3 flex-1">
                        <div className="flex gap-3">
                            <input type="text" placeholder="Nome do Prato (Ex: X-Bacon)" value={newItemTitle} onChange={(e) => setNewItemTitle(e.target.value)} className="flex-1 border rounded-lg p-2 text-sm focus:border-orange-500 outline-none" required />
                            <input type="text" placeholder="Preço (R$)" value={newItemPrice} onChange={(e) => setNewItemPrice(e.target.value)} className="w-24 border rounded-lg p-2 text-sm focus:border-orange-500 outline-none" />
                        </div>
                        <textarea placeholder="Descrição (Ingredientes, detalhes...)" value={newItemDesc} onChange={(e) => setNewItemDesc(e.target.value)} rows={2} className="w-full border rounded-lg p-2 text-sm focus:border-orange-500 outline-none resize-none" />
                    </div>
                </div>
                <button type="submit" className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl transition shadow-md flex justify-center items-center gap-2">Adicionar ao Cardápio</button>
            </form>
        </div>

        {/* LISTA DE ITENS (CARDÁPIO) */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Itens do Cardápio (Arraste para organizar)</h3>
            
            {pageData?.links && pageData.links.length > 0 ? (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={pageData.links.map((l, idx) => (l.url || l.title) + idx)} strategy={verticalListSortingStrategy}>
                        <div className="space-y-3">
                            {pageData.links.map((link, index) => {
                                if (editingIndex === index) {
                                    // FORMULÁRIO DE EDIÇÃO
                                    return (
                                        <div key={(link.url || link.title) + index} className="bg-orange-50 border border-orange-200 p-4 rounded-xl space-y-4">
                                            <h4 className="text-sm font-bold text-orange-800">Editando Item</h4>
                                            <div className="flex gap-4">
                                                <div className="w-20 h-20 bg-white rounded border border-orange-200 relative shrink-0">
                                                    {editItemImage ? <Image src={editItemImage} alt="Prato" fill className="object-cover rounded" /> : <div className="w-full h-full flex items-center justify-center text-gray-300"><FaImage/></div>}
                                                    <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => handleItemImageUpload(e, false)} />
                                                </div>
                                                <div className="flex-1 space-y-2">
                                                    <div className="flex gap-2">
                                                        <input type="text" value={editItemTitle} onChange={(e) => setEditItemTitle(e.target.value)} className="flex-1 border p-2 rounded text-sm" placeholder="Nome" />
                                                        <input type="text" value={editItemPrice} onChange={(e) => setEditItemPrice(e.target.value)} className="w-20 border p-2 rounded text-sm" placeholder="Preço" />
                                                    </div>
                                                    <textarea value={editItemDesc} onChange={(e) => setEditItemDesc(e.target.value)} className="w-full border p-2 rounded text-sm" rows={2} placeholder="Descrição" />
                                                </div>
                                            </div>
                                            <div className="flex justify-end gap-2">
                                                <button onClick={() => setEditingIndex(null)} className="px-4 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg">Cancelar</button>
                                                <button onClick={() => handleUpdateItem(index)} className="px-4 py-2 text-sm text-white bg-green-600 rounded-lg hover:bg-green-700">Salvar Alterações</button>
                                            </div>
                                        </div>
                                    );
                                }
                                return (
                                    <SortableLinkItem 
                                        key={(link.url || link.title) + index} 
                                        link={link} 
                                        index={index} 
                                        onEdit={() => handleEditClick(link, index)} 
                                        onDelete={() => handleDeleteLink(link)} 
                                        editingIndex={editingIndex} 
                                    />
                                );
                            })}
                        </div>
                    </SortableContext>
                </DndContext>
            ) : (
                <div className="text-center py-10 text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                    <FaUtensils size={30} className="mx-auto mb-2 opacity-50"/>
                    <p>Seu cardápio está vazio.</p>
                </div>
            )}
        </div>

        {/* APARÊNCIA */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
             <h3 className="text-lg font-bold text-gray-800 mb-4">Personalização Visual</h3>
             <div className="mb-6">
                 <label className="block text-sm font-medium text-gray-600 mb-2">Imagem de Fundo (Capa do Cardápio)</label>
                 <div className="flex gap-4 items-center">
                    {pageData?.backgroundImage && <div className="w-16 h-10 relative rounded overflow-hidden border"><Image src={pageData.backgroundImage} alt="Bg" fill className="object-cover"/></div>}
                    <input type="file" accept="image/*" onChange={handleBackgroundImageUpload} disabled={!isProPlan || isUploadingBg} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100" />
                 </div>
                 {!isProPlan && <p className="text-xs text-orange-500 mt-1 flex items-center gap-1"><FaLock/> Recurso Pro</p>}
             </div>
             
             <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {themes.map(t => (
                    <button key={t.name} onClick={() => handleThemeChange(t.name)} disabled={t.isPro && !isProPlan} className={`p-2 border rounded-lg text-center transition ${pageData?.theme === t.name ? 'ring-2 ring-orange-500 border-orange-500' : 'hover:border-gray-400'} ${t.isPro && !isProPlan ? 'opacity-50' : ''}`}>
                        <div className={`h-8 w-full rounded mb-1 ${t.colorClass}`}></div>
                        <span className="text-xs font-medium">{t.label}</span>
                    </button>
                ))}
             </div>
        </div>

        {/* ANALYTICS SIMPLES */}
        {pageData?.links && (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><FaChartLine className="text-blue-500"/> Itens Mais Populares</h3>
                <div className="h-48 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={pageData.links.map(l => ({name: l.title, clicks: l.clicks || 0}))}>
                            <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} />
                            <Tooltip />
                            <Bar dataKey="clicks" fill="#f97316" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        )}

        {/* ADMIN AREA */}
        {isAdmin && (
            <div className="bg-gray-100 p-6 rounded-xl border border-gray-200 mt-10">
                <h3 className="font-bold text-gray-700 mb-4">Super Admin</h3>
                <form onSubmit={handleSearchUser} className="flex gap-2 mb-4">
                    <input type="email" value={searchEmail} onChange={e => setSearchEmail(e.target.value)} className="flex-1 p-2 rounded border" placeholder="Email do cliente" />
                    <button className="bg-gray-800 text-white px-4 rounded">Buscar</button>
                </form>
                {foundUser && (
                    <div className="bg-white p-4 rounded shadow">
                        <p className="font-bold">{foundUser.email}</p>
                        <p>Plano: {foundUser.plan}</p>
                        <div className="flex gap-2 mt-2">
                            <button onClick={() => handleChangePlan(foundUser.plan === 'free' ? 'pro' : 'free')} className="bg-yellow-500 text-white px-3 py-1 rounded text-sm">Alternar Plano</button>
                            <button onClick={() => handleManageUser(foundUser.uid, foundUser.email)} className="bg-blue-600 text-white px-3 py-1 rounded text-sm">Gerenciar Cardápio</button>
                        </div>
                    </div>
                )}
            </div>
        )}
      </main>
    </div>
  );
}