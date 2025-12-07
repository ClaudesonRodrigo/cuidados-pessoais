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
import { FaLock, FaSearch, FaCamera, FaUserCog, FaArrowLeft, FaImage, FaSave, FaQrcode, FaChartLine } from 'react-icons/fa';
import Image from 'next/image';

// --- Imports para Drag and Drop ---
import { 
  DndContext, 
  closestCenter, 
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors, 
  DragEndEvent 
} from '@dnd-kit/core';
import { 
  arrayMove, 
  SortableContext, 
  sortableKeyboardCoordinates, 
  verticalListSortingStrategy 
} from '@dnd-kit/sortable';
import { SortableLinkItem } from '@/components/SortableLinkItem';

// --- Libs Novas ---
import { QRCodeCanvas } from 'qrcode.react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

// --- CONFIGURAÇÃO DO CLOUDINARY ---
const CLOUDINARY_CLOUD_NAME = "dhzzvc3vl"; 
const CLOUDINARY_UPLOAD_PRESET = "links-page-pro"; 
// ----------------------------------

// Definição dos temas disponíveis
const themes = [
  { name: 'light', label: 'Claro', colorClass: 'bg-gray-100', isPro: false },
  { name: 'dark', label: 'Escuro', colorClass: 'bg-gray-900', isPro: false },

  // Novos Temas PRO
  { name: 'developer', label: 'Desenvolvedor', colorClass: 'bg-[#0d1117] border border-[#238636]', isPro: true },
  { name: 'realtor', label: 'Corretor (Luxo)', colorClass: 'bg-neutral-900 border border-yellow-600', isPro: true },
  { name: 'restaurant', label: 'Restaurante', colorClass: 'bg-red-900', isPro: true },
  { name: 'mechanic', label: 'Oficina', colorClass: 'bg-slate-800 border-l-4 border-cyan-500', isPro: true },
  { name: 'influencer', label: 'Influencer', colorClass: 'bg-gradient-to-tr from-yellow-400 to-purple-600', isPro: true },

  // Temas Pro Antigos
  { name: 'ocean', label: 'Oceano', colorClass: 'bg-gradient-to-r from-ocean-start to-ocean-end', isPro: true },
  { name: 'sunset', label: 'Pôr do Sol', colorClass: 'bg-gradient-to-r from-sunset-start to-sunset-end', isPro: true },
  { name: 'forest', label: 'Floresta', colorClass: 'bg-forest-bg', isPro: true },
  { name: 'bubblegum', label: 'Chiclete', colorClass: 'bg-bubblegum-bg', isPro: true },
];

export default function DashboardPage() {
  const { user, userData, loading } = useAuth();
  const router = useRouter();
  
  // Estado Principal
  const [pageData, setPageData] = useState<PageData | null>(null);
  const [pageSlug, setPageSlug] = useState<string | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);

  // --- MODO SUPER ADMIN (Gerenciar outro usuário) ---
  const [targetUserId, setTargetUserId] = useState<string | null>(null);
  const [targetUserEmail, setTargetUserEmail] = useState<string | null>(null);
  // --------------------------------------------------

  // --- ESTADOS PARA EDIÇÃO DE PERFIL (TEXTO) ---
  const [editingProfileTitle, setEditingProfileTitle] = useState('');
  const [editingProfileBio, setEditingProfileBio] = useState('');

  // Estados de Links e UI
  const [newLinkTitle, setNewLinkTitle] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [newLinkIcon, setNewLinkIcon] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingUrl, setEditingUrl] = useState('');
  const [editingIcon, setEditingIcon] = useState('');
  const [copyButtonText, setCopyButtonText] = useState('Copiar');

  // Estado para a imagem de fundo personalizada
  const [customBgUrl, setCustomBgUrl] = useState('');

  // Estados para upload
  const [isUploadingProfile, setIsUploadingProfile] = useState(false);
  const [isUploadingBg, setIsUploadingBg] = useState(false);
  
  // Estado QR Code
  const [showQRCode, setShowQRCode] = useState(false);

  // Verifica se é Admin
  const isAdmin = userData?.role === 'admin';

  // Verifica se o plano é Pro
  const isProPlan = targetUserId ? true : (userData?.plan === 'pro');

  // Estados Admin (Busca)
  const [searchEmail, setSearchEmail] = useState('');
  const [foundUser, setFoundUser] = useState<(UserData & { uid: string }) | null>(null);
  const [adminMessage, setAdminMessage] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isUpdatingPlan, setIsUpdatingPlan] = useState(false);

  const whatsappNumber = "5579996337995";

  // --- CONFIGURAÇÃO DOS SENSORES DO DND-KIT ---
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, 
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // --- FUNÇÃO PARA LIDAR COM O FIM DO ARRASTE ---
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id && pageData?.links) {
      setPageData((prev) => {
        if (!prev) return null;
        
        const oldIndex = prev.links.findIndex((link, idx) => (link.url + idx) === active.id);
        const newIndex = prev.links.findIndex((link, idx) => (link.url + idx) === over.id);

        const newLinks = arrayMove(prev.links, oldIndex, newIndex);
        
        const reorderedLinks = newLinks.map((link, index) => ({
          ...link,
          order: index + 1
        }));

        if (pageSlug) {
            updateLinksOnPage(pageSlug, reorderedLinks).catch(err => {
                console.error("Erro ao salvar ordem:", err);
                alert("Erro ao salvar a nova ordem dos links.");
            });
        }

        return {
          ...prev,
          links: reorderedLinks,
        };
      });
    }
  };

  // --- FUNÇÕES ---

  const fetchPageData = useCallback(async () => {
    const idToFetch = targetUserId || user?.uid;

    if (idToFetch) {
      setIsLoadingData(true);
      const result = await getPageDataForUser(idToFetch);
      if (result) {
        const data = result.data as PageData;
        
        if (data.links) {
            data.links.sort((a, b) => (a.order || 0) - (b.order || 0));
        }

        setPageData(data);
        setPageSlug(result.slug);
        
        setEditingProfileTitle(data.title || '');
        setEditingProfileBio(data.bio || '');

        if (data.backgroundImage) {
          setCustomBgUrl(data.backgroundImage);
        } else {
          setCustomBgUrl('');
        }
      } else {
        console.error("Não foi possível carregar os dados da página do usuário.");
        setPageData(null);
        setPageSlug(null);
      }
      setIsLoadingData(false);
    } else {
      setIsLoadingData(false);
    }
  }, [user, targetUserId]);

  useEffect(() => {
    if (!loading && user) {
      fetchPageData();
    }
  }, [user, loading, fetchPageData]);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/admin/login');
    }
  }, [user, loading, router]);

  const handleLogout = async () => {
    await signOutUser();
  };

  const handleManageUser = (uid: string, email: string | undefined) => {
    setTargetUserId(uid);
    setTargetUserEmail(email || 'Cliente');
    setAdminMessage(null);
    setFoundUser(null);
    setSearchEmail('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleExitAdminMode = () => {
    setTargetUserId(null);
    setTargetUserEmail(null);
  };

  const generateWhatsAppLink = (planType: 'Mensal' | 'Anual', price: string) => {
    const message = `Olá! Gostaria de fazer o upgrade para o plano Pro ${planType} (R$${price}).`;
    return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
  };

  const handleAddLink = async (e: FormEvent) => {
    e.preventDefault();
    if (!pageSlug || !newLinkTitle || !newLinkUrl) {
      alert("Por favor, preencha pelo menos o Título e a URL.");
      return;
    }
    const currentLinks = pageData?.links || [];
    const newOrder = currentLinks.length > 0 ? Math.max(...currentLinks.map(l => l.order)) + 1 : 1;

    const newLink: LinkData = {
      title: newLinkTitle,
      url: newLinkUrl,
      ...(newLinkIcon.trim() && { icon: newLinkIcon.trim().toLowerCase() }),
      type: "website",
      order: newOrder,
      clicks: 0,
    };
    try {
      await addLinkToPage(pageSlug, newLink);
      setNewLinkTitle('');
      setNewLinkUrl('');
      setNewLinkIcon('');
      await fetchPageData();
    } catch (error) {
      console.error("Erro ao adicionar link:", error);
      alert("Falha ao adicionar o link. Tente novamente.");
    }
  };

  const handleDeleteLink = async (linkToDelete: LinkData) => {
    if (!window.confirm(`Tem certeza que deseja excluir o link "${linkToDelete.title}"?`)) {
      return;
    }
    if (!pageSlug) {
      alert("Erro crítico: ID da página não encontrado.");
      return;
    }
    try {
      await deleteLinkFromPage(pageSlug, linkToDelete);
      await fetchPageData();
    } catch (error) {
      console.error("Erro ao excluir link:", error);
      alert("Falha ao excluir o link.");
    }
  };

  const handleEditClick = (link: LinkData, index: number) => {
    setEditingIndex(index);
    setEditingTitle(link.title);
    setEditingUrl(link.url);
    setEditingIcon(link.icon || '');
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setEditingTitle('');
    setEditingUrl('');
    setEditingIcon('');
  };

  const handleUpdateLink = async (indexToUpdate: number) => {
    if (!pageSlug || !pageData || !pageData.links || editingIndex !== indexToUpdate) return;

    const updatedLinks = [...pageData.links];

    updatedLinks[indexToUpdate] = {
      ...updatedLinks[indexToUpdate],
      title: editingTitle,
      url: editingUrl,
      ...(editingIcon.trim() ? { icon: editingIcon.trim().toLowerCase() } : { icon: undefined }),
    };

    if (!editingIcon.trim()) {
      delete updatedLinks[indexToUpdate].icon;
    }

    try {
      await updateLinksOnPage(pageSlug, updatedLinks);
      handleCancelEdit();
      await fetchPageData();
    } catch (error) {
      console.error("Erro ao atualizar link:", error);
      alert("Falha ao atualizar o link. Tente novamente.");
    }
  };

  const handleCopyUrl = () => {
    if (!pageSlug) return;
    const shareableUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/${pageSlug}`;
    navigator.clipboard.writeText(shareableUrl)
      .then(() => {
        setCopyButtonText('Copiado!');
        setTimeout(() => setCopyButtonText('Copiar'), 2000);
      })
      .catch(err => {
        console.error('Erro ao copiar URL:', err);
        alert('Não foi possível copiar a URL.');
      });
  };

  const handleThemeChange = async (themeName: string) => {
    const theme = themes.find(t => t.name === themeName);
    if (!theme) return;

    if (theme.isPro && !isProPlan) {
      alert('Este é um tema Pro! Faça upgrade para usá-lo.');
      return;
    }

    if (!pageSlug) {
      alert("Erro: Slug da página não encontrado para salvar o tema.");
      return;
    };

    try {
      await updatePageTheme(pageSlug, themeName);
      setPageData(prevData => prevData ? { ...prevData, theme: themeName } : null);
    } catch (error) {
      console.error("Erro ao mudar tema:", error);
      alert("Falha ao atualizar o tema. Tente novamente.");
    }
  };

  const uploadToCloudinary = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    formData.append('cloud_name', CLOUDINARY_CLOUD_NAME);

    try {
      const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Erro no upload Cloudinary:", errorData);
        throw new Error('Falha no upload da imagem.');
      }

      const data = await response.json();
      return data.secure_url;
    } catch (error) {
      console.error("Erro ao fazer upload:", error);
      throw error;
    }
  };

  const handleProfileImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !pageSlug) return;

    setIsUploadingProfile(true);
    try {
      const imageUrl = await uploadToCloudinary(file);
      await updateProfileImage(pageSlug, imageUrl);
      setPageData(prev => prev ? { ...prev, profileImageUrl: imageUrl } : null);
      alert("Foto de perfil atualizada com sucesso!");
    } catch (error) {
        console.error(error);
        alert("Erro ao atualizar foto de perfil.");
    } finally {
      setIsUploadingProfile(false);
    }
  };

  const handleBackgroundImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !pageSlug) return;

    if (!isProPlan) {
      alert("Imagem de fundo personalizada é um recurso Pro!");
      return;
    }

    setIsUploadingBg(true);
    try {
      const imageUrl = await uploadToCloudinary(file);
      await updatePageBackground(pageSlug, imageUrl);
      setPageData(prev => prev ? { ...prev, backgroundImage: imageUrl } : null);
      alert("Imagem de fundo atualizada com sucesso!");
    } catch (error) {
        console.error(error);
        alert("Erro ao atualizar imagem de fundo.");
    } finally {
      setIsUploadingBg(false);
    }
  };

  const handleSaveProfileInfo = async () => {
    if (!pageSlug) return;
    try {
      await updatePageProfileInfo(pageSlug, editingProfileTitle, editingProfileBio);
      setPageData(prev => prev ? { ...prev, title: editingProfileTitle, bio: editingProfileBio } : null);
      alert("Informações salvas!");
    } catch (error) {
        console.error(error);
        alert("Erro ao salvar informações."); 
    }
  };

  const handleSearchUser = async (e: FormEvent) => {
    e.preventDefault();
    if (!searchEmail) return;
    setIsSearching(true);
    setAdminMessage(null);
    setFoundUser(null);
    try {
      const userResult = await findUserByEmail(searchEmail);
      if (userResult) {
        setFoundUser(userResult);
      } else {
        setAdminMessage(`Usuário com email "${searchEmail}" não encontrado.`);
      }
    } catch (error) {
      console.error("Erro ao buscar usuário:", error);
      setAdminMessage("Ocorreu um erro ao buscar o usuário. Verifique o console.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleChangePlan = async (newPlan: 'pro' | 'free') => {
    if (!foundUser) return;
    setIsUpdatingPlan(true);
    setAdminMessage(null);
    try {
      await updateUserPlan(foundUser.uid, newPlan);
      setFoundUser(prev => prev ? { ...prev, plan: newPlan } : null);
      setAdminMessage(`Plano do usuário ${foundUser.email} atualizado para '${newPlan}' com sucesso!`);
    } catch (error) {
      console.error("Erro ao atualizar plano:", error);
      setAdminMessage(`Falha ao atualizar o plano: ${(error as Error).message}`);
    } finally {
      setIsUpdatingPlan(false);
    }
  };

  if (loading || (!isAdmin && isLoadingData)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <p className="text-xl">Carregando...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  // Preparar dados para o gráfico
  const chartData = pageData?.links?.map(link => ({
    name: link.title,
    cliques: link.clicks || 0
  })) || [];

  return (
    <div className="min-h-screen bg-gray-50 relative">
      {targetUserId && (
        <div className="bg-red-600 text-white px-4 py-3 shadow-md sticky top-0 z-50">
          <div className="max-w-4xl mx-auto flex justify-between items-center">
            <div className="flex items-center gap-2 font-bold">
              <FaUserCog className="text-xl" />
              <span>MODO SUPER ADMIN: Gerenciando {targetUserEmail}</span>
            </div>
            <button 
              onClick={handleExitAdminMode}
              className="bg-white text-red-600 px-4 py-1 rounded-full text-sm font-bold hover:bg-gray-100 transition flex items-center gap-2"
            >
              <FaArrowLeft /> Sair e Voltar
            </button>
          </div>
        </div>
      )}

      <nav className={`bg-white shadow-sm ${targetUserId ? '' : 'sticky top-0 z-10'}`}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="shrink-0 flex items-center">
              <h1 className="text-xl font-bold text-gray-800">Meu Painel {isAdmin && <span className="text-red-600 text-sm">(Admin)</span>}</h1>
            </div>
            <div className="flex items-center">
              <button
                onClick={handleLogout}
                className="bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-md text-sm transition duration-150 ease-in-out"
              >
                Sair
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">

        <div className="bg-white p-6 rounded-lg shadow mb-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
            <div>
              <h2 className="text-2xl font-semibold text-gray-900">
                {targetUserId ? `Editando: ${pageData?.title}` : `Bem-vindo, ${pageData?.title || userData?.displayName || user.displayName || 'Usuário'}!`}
              </h2>
              <span className={`text-sm font-medium px-3 py-1 rounded-full mt-2 inline-block ${isProPlan ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                }`}>
                Plano: {isProPlan ? 'Pro' : 'Gratuito'}
              </span>
            </div>

            <div className="flex items-center gap-4">
              <div className="relative group">
                {pageData?.profileImageUrl ? (
                  <Image
                    src={pageData.profileImageUrl}
                    alt="Foto de Perfil"
                    width={80}
                    height={80}
                    className="w-20 h-20 rounded-full object-cover border-2 border-gray-200"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center text-gray-400">
                    <FaCamera size={24} />
                  </div>
                )}
                <label htmlFor="profile-upload" className="absolute bottom-0 right-0 bg-blue-600 text-white p-2 rounded-full cursor-pointer hover:bg-blue-700 transition-colors shadow-md">
                  <FaCamera size={14} />
                  <input
                    id="profile-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleProfileImageUpload}
                    disabled={isUploadingProfile}
                  />
                </label>
                {isUploadingProfile && (
                  <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <p className="text-gray-700 mb-2">
            Gerencie sua página de links abaixo.
          </p>
        </div>

        {/* --- SEÇÃO DE ANALYTICS (GRÁFICOS) --- */}
        {pageData?.links && pageData.links.length > 0 && (
            <div className="bg-white p-6 rounded-lg shadow mb-8">
                <h3 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <FaChartLine className="text-blue-600" /> Desempenho dos Links
                    {!isProPlan && <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">Prévia</span>}
                </h3>
                <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                            <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                            <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}`} />
                            <Tooltip cursor={{fill: 'transparent'}} contentStyle={{ borderRadius: '8px' }} />
                            <Bar dataKey="cliques" radius={[4, 4, 0, 0]}>
                                {chartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={index % 2 === 0 ? "#2563eb" : "#3b82f6"} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        )}

        {pageSlug && (
          <>
            <div className="bg-white p-6 rounded-lg shadow mb-8">
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Sua Página está no Ar!</h3>
              
              <div className="flex flex-col sm:flex-row items-center gap-2 p-3 bg-gray-100 rounded-md w-full mb-4">
                <span className="text-blue-600 truncate font-mono text-sm w-full block">
                  {`${typeof window !== 'undefined' ? window.location.origin : ''}/${pageSlug}`}
                </span>
                <button
                  onClick={handleCopyUrl}
                  className={`w-full sm:w-auto text-white font-medium py-2 px-4 rounded-md text-sm transition-all duration-200 bg-blue-600 hover:bg-blue-700`}
                >
                  {copyButtonText}
                </button>
                <button
                    onClick={() => setShowQRCode(!showQRCode)}
                    className="w-full sm:w-auto bg-gray-800 text-white font-medium py-2 px-4 rounded-md text-sm hover:bg-gray-900 flex items-center justify-center gap-2"
                >
                    <FaQrcode /> QR Code
                </button>
              </div>

              {/* MODAL QR CODE */}
              {showQRCode && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowQRCode(false)}>
                      <div className="bg-white p-6 rounded-xl shadow-2xl text-center max-w-sm w-full animate-in fade-in zoom-in duration-200" onClick={(e) => e.stopPropagation()}>
                          <h3 className="text-lg font-bold mb-4">Seu QR Code</h3>
                          <div className="bg-white p-2 inline-block rounded-lg shadow-inner mb-4 border border-gray-200">
                              <QRCodeCanvas 
                                  value={`${typeof window !== 'undefined' ? window.location.origin : ''}/${pageSlug}`} 
                                  size={200}
                                  level={"H"}
                              />
                          </div>
                          <p className="text-sm text-gray-500 mb-4">Escaneie para acessar seu perfil.</p>
                          <button onClick={() => setShowQRCode(false)} className="w-full bg-gray-200 py-2 rounded-lg font-medium hover:bg-gray-300">Fechar</button>
                      </div>
                  </div>
              )}
            </div>

            <div className="bg-white p-6 rounded-lg shadow mb-8">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Informações do Perfil</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Nome / Título</label>
                  <input
                    type="text"
                    value={editingProfileTitle}
                    onChange={(e) => setEditingProfileTitle(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Bio (Descrição)</label>
                  <textarea
                    value={editingProfileBio}
                    onChange={(e) => setEditingProfileBio(e.target.value)}
                    rows={3}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
                  />
                </div>
                <button
                  onClick={handleSaveProfileInfo}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 font-medium flex items-center gap-2"
                >
                  <FaSave /> Salvar Informações
                </button>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow mb-8" id="appearance-section">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Aparência</h3>
              <p className="text-gray-600 mb-4">Escolha um tema para sua página pública.</p>
              
              <div className="mb-6 p-4 bg-gray-50 rounded border">
                 <h4 className="font-medium mb-2 flex items-center gap-2"><FaImage /> Fundo Personalizado {!isProPlan && <FaLock className="text-gray-400 w-3 h-3" />}</h4>
                 <input type="file" accept="image/*" onChange={handleBackgroundImageUpload} disabled={!isProPlan || isUploadingBg} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"/>
                 {isUploadingBg && <p className="text-xs text-indigo-600 mt-1">Enviando...</p>}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
                {themes.map((theme) => {
                  const isActive = (pageData?.theme || 'light') === theme.name;
                  const isDisabledByPlan = theme.isPro && !isProPlan;

                  return (
                    <button
                      key={theme.name}
                      onClick={() => handleThemeChange(theme.name)}
                      disabled={isDisabledByPlan}
                      className={`relative p-4 rounded-lg border-2 text-center transition-all duration-150 ease-in-out focus:outline-none ${isActive
                        ? 'border-blue-600 ring-2 ring-blue-300'
                        : isDisabledByPlan
                          ? 'border-gray-200 opacity-50 cursor-not-allowed'
                          : 'border-gray-300 hover:border-gray-400'
                        }`}
                      aria-pressed={isActive}
                      aria-disabled={isDisabledByPlan}
                    >
                      <div className={`h-10 w-full rounded mb-2 border border-gray-200 ${theme.colorClass}`}></div>
                      <span className="text-sm font-medium text-gray-700 flex items-center justify-center gap-1">
                        {theme.label}
                        {isDisabledByPlan && <FaLock className="text-gray-400 w-3 h-3" />}
                      </span>
                    </button>
                  );
                })}
              </div>

              {!isProPlan && !targetUserId && (
                <div className="mt-8 pt-6 border-t border-gray-200" id="upgrade-section">
                  <h4 className="text-lg font-semibold text-center text-gray-800 mb-4">
                    ✨ Desbloqueie todos os temas com o Plano Pro! ✨
                  </h4>
                  <p className="text-center text-gray-600 mb-6">
                    Escolha seu plano e fale conosco no WhatsApp para ativar:
                  </p>
                  <div className="flex flex-col sm:flex-row justify-center gap-4">
                    <a
                      href={generateWhatsAppLink('Mensal', '9,99')}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 text-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition duration-300 ease-in-out"
                    >
                      Pro Mensal - R$9,99
                    </a>
                    <a
                      href={generateWhatsAppLink('Anual', '90,00')}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 text-center bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg transition duration-300 ease-in-out"
                    >
                      Pro Anual - R$90,00 <span className="text-xs opacity-80">(Economize!)</span>
                    </a>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white p-6 rounded-lg shadow mb-8">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Adicionar Novo Link</h3>
              <form onSubmit={handleAddLink} className="space-y-4">
                <div>
                  <label htmlFor="linkTitle" className="block text-sm font-medium text-gray-700">Título</label>
                  <input required type="text" id="linkTitle" value={newLinkTitle} onChange={(e) => setNewLinkTitle(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" placeholder="Ex: Meu Portfólio"
                  />
                </div>
                <div>
                  <label htmlFor="linkUrl" className="block text-sm font-medium text-gray-700">URL</label>
                  <input required type="url" id="linkUrl" value={newLinkUrl} onChange={(e) => setNewLinkUrl(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" placeholder="https://..."
                  />
                </div>
                <div>
                  <label htmlFor="linkIcon" className="block text-sm font-medium text-gray-700">Ícone (opcional)</label>
                  <input type="text" id="linkIcon" value={newLinkIcon} onChange={(e) => setNewLinkIcon(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" placeholder="Ex: github, instagram, linkedin, globe"
                  />
                  <p className="mt-1 text-xs text-gray-500">Use nomes em minúsculo. (ex: github, instagram, globe, link)</p>
                </div>
                <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition duration-150 ease-in-out">Adicionar Link</button>
              </form>
            </div>

            <div className="mt-8">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Meus Links (Arraste para reordenar)</h3>
              <div className="bg-white p-6 rounded-lg shadow">
                {pageData?.links && pageData.links.length > 0 ? (
                  <DndContext 
                    sensors={sensors} 
                    collisionDetection={closestCenter} 
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext 
                      items={pageData.links.map((l, idx) => l.url + idx)} 
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-3">
                        {pageData.links.map((link, index) => {
                           if (editingIndex === index) {
                             return (
                               <div key={link.url + index} className="p-4 bg-blue-50 border border-blue-200 rounded-lg shadow-inner mb-3">
                                  <div className="space-y-3">
                                    <div>
                                      <label className="text-xs font-medium text-gray-500">Título</label>
                                      <input type="text" value={editingTitle} onChange={(e) => setEditingTitle(e.target.value)}
                                        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm" />
                                    </div>
                                    <div>
                                      <label className="text-xs font-medium text-gray-500">URL</label>
                                      <input type="url" value={editingUrl} onChange={(e) => setEditingUrl(e.target.value)}
                                        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm" />
                                    </div>
                                    <div>
                                      <label className="text-xs font-medium text-gray-500">Ícone</label>
                                      <input type="text" value={editingIcon} onChange={(e) => setEditingIcon(e.target.value)}
                                        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm" placeholder="Ícone (opcional)" />
                                    </div>
                                    <div className="flex justify-end space-x-2 pt-2">
                                      <button onClick={handleCancelEdit} className="bg-gray-200 text-gray-800 hover:bg-gray-300 font-semibold py-1 px-3 rounded-md text-sm">Cancelar</button>
                                      <button onClick={() => handleUpdateLink(index)} className="bg-green-600 text-white hover:bg-green-700 font-semibold py-1 px-3 rounded-md text-sm">Salvar</button>
                                    </div>
                                  </div>
                               </div>
                             );
                           }

                           return (
                             <SortableLinkItem 
                               key={link.url + index}
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
                  <p className="text-center text-gray-500 py-4">Você ainda não tem links. Adicione um acima!</p>
                )}
              </div>
            </div>
          </>
        )}

        {isAdmin && !targetUserId && (
          <div className="mt-12 border-t-2 border-red-600 pt-8">
            <h3 className="text-2xl font-bold text-red-700 mb-6 text-center">
              🛡️ Painel do Super Admin 🛡️
            </h3>
            <div className="bg-white p-6 rounded-lg shadow-lg border border-red-200">
              <h4 className="text-lg font-semibold text-gray-800 mb-4">Gerenciar Planos de Usuários</h4>
              <form onSubmit={handleSearchUser} className="flex flex-col sm:flex-row gap-2 mb-4">
                <input
                  type="email"
                  value={searchEmail}
                  onChange={(e) => setSearchEmail(e.target.value)}
                  placeholder="Digite o email do usuário"
                  required
                  className="flex-grow px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-red-500 focus:border-red-500 sm:text-sm"
                />
                <button
                  type="submit"
                  disabled={isSearching}
                  className="bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-md transition duration-150 ease-in-out flex items-center justify-center disabled:opacity-50"
                >
                  <FaSearch className="mr-2 h-4 w-4" /> {isSearching ? 'Buscando...' : 'Buscar Usuário'}
                </button>
              </form>

              {adminMessage && (
                <p className={`text-sm mb-4 p-3 rounded-md ${adminMessage.includes('sucesso')
                  ? 'bg-green-100 text-green-700'
                  : adminMessage.includes('não encontrado')
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-red-100 text-red-700'
                  }`}
                >
                  {adminMessage}
                </p>
              )}

              {foundUser && (
                <div className="mt-4 p-4 border border-gray-200 rounded-md bg-gray-50">
                  <p className="text-sm text-gray-700">
                    <span className="font-semibold">Usuário:</span> {foundUser.displayName || '(Sem nome)'} ({foundUser.email})
                  </p>
                  <p className="text-sm text-gray-700">
                    <span className="font-semibold">UID:</span> {foundUser.uid}
                  </p>
                  <p className="text-sm text-gray-700 mb-3">
                    <span className="font-semibold">Plano Atual:</span>
                    <span className={`ml-1 font-medium px-2 py-0.5 rounded ${foundUser.plan === 'pro' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                      {foundUser.plan === 'pro' ? 'Pro' : 'Gratuito'}
                    </span>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => handleChangePlan(foundUser.plan === 'free' ? 'pro' : 'free')}
                      disabled={isUpdatingPlan}
                      className={`px-3 py-1 rounded text-white text-sm disabled:opacity-50 ${foundUser.plan === 'free' ? 'bg-green-600 hover:bg-green-700' : 'bg-yellow-600 hover:bg-yellow-700'}`}
                    >
                      {foundUser.plan === 'free' ? 'Ativar Pro' : 'Desativar Pro'}
                    </button>
                    
                    <button 
                      onClick={() => handleManageUser(foundUser.uid, foundUser.email)}
                      className="px-3 py-1 rounded bg-blue-600 text-white text-sm flex items-center gap-1 hover:bg-blue-700"
                    >
                      <FaUserCog /> Gerenciar Página
                    </button>

                    <button
                      onClick={() => { setFoundUser(null); setSearchEmail(''); setAdminMessage(null); }}
                      className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold py-1 px-3 rounded-md text-sm"
                    >
                      Limpar Busca
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}