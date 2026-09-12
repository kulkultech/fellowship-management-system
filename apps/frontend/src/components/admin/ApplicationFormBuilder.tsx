import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from '@/services/adminService';
import type { Program, ApplicationFormSchema, CustomFormField, FormFieldType } from '@/services/types';
import {
  STANDARD_FIELD_KEYS,
  STANDARD_FIELD_METADATA,
  DEFAULT_COMPANY_SCHEMA,
  getResolvedFieldOrder,
  type StandardFieldKey,
} from '@/services/formSchema';
import {
  ArrowLeft,
  Save,
  Plus,
  Trash2,
  CheckCircle,
  Eye,
  EyeOff,
  Settings,
  Sliders,
  FileText,
  Upload,
  RotateCcw,
  ArrowUp,
  ArrowDown,
  GripVertical,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Props {
  program: Program;
  onBack: () => void;
  onSaved?: (updated: Program) => void;
}

export const ApplicationFormBuilder: React.FC<Props> = ({ program, onBack, onSaved }) => {
  const queryClient = useQueryClient();

  const getInitialSchema = (): ApplicationFormSchema => {
    if (program.application_form_schema && program.application_form_schema.fields) {
      const parsed = JSON.parse(JSON.stringify(program.application_form_schema));
      if (!parsed.field_order || parsed.field_order.length === 0) {
        parsed.field_order = getResolvedFieldOrder(parsed.fields, parsed.custom_fields);
      }
      return parsed;
    }
    return JSON.parse(JSON.stringify(DEFAULT_COMPANY_SCHEMA));
  };

  const [schema, setSchema] = useState<ApplicationFormSchema>(getInitialSchema());
  const [activeTab, setActiveTab] = useState<'editor' | 'preview'>('editor');
  const [expandedOptionField, setExpandedOptionField] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  useEffect(() => {
    setSchema(getInitialSchema());
  }, [program.id]);

  const activeOrder = getResolvedFieldOrder(schema.fields, schema.custom_fields || [], schema.field_order);

  const saveMutation = useMutation({
    mutationFn: (updatedSchema: ApplicationFormSchema) =>
      adminService.updateProgramFormSchema(program.id, updatedSchema),
    onSuccess: (updatedProg) => {
      toast.success('Application form schema saved successfully!');
      queryClient.invalidateQueries({ queryKey: ['admin-all-programs'] });
      queryClient.invalidateQueries({ queryKey: ['program', program.slug] });
      if (onSaved) onSaved(updatedProg);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.message || 'Failed to save application form schema');
    },
  });

  const handleSave = () => {
    const finalSchema: ApplicationFormSchema = {
      ...schema,
      field_order: activeOrder,
    };
    saveMutation.mutate(finalSchema);
  };

  const handleToggleStandardField = (key: string, enabled: boolean) => {
    setSchema((prev) => {
      const current = prev.fields?.[key] || { enabled: false, required: false };
      const nextFields = {
        ...(prev.fields || {}),
        [key]: {
          ...current,
          enabled,
          required: enabled ? current.required : false,
        },
      };

      const currentOrder = getResolvedFieldOrder(prev.fields, prev.custom_fields || [], prev.field_order);
      let nextOrder: string[];
      if (enabled) {
        if (!currentOrder.includes(key)) {
          nextOrder = [...currentOrder, key];
        } else {
          nextOrder = currentOrder;
        }
      } else {
        nextOrder = currentOrder.filter((k) => k !== key);
      }

      return {
        ...prev,
        fields: nextFields,
        field_order: nextOrder,
      };
    });
  };

  const handleToggleStandardRequired = (key: string, required: boolean) => {
    setSchema((prev) => {
      const current = prev.fields?.[key] || { enabled: true, required: false };
      return {
        ...prev,
        fields: {
          ...(prev.fields || {}),
          [key]: {
            ...current,
            required,
          },
        },
      };
    });
  };

  const handleMoveField = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= activeOrder.length) return;

    const nextOrder = [...activeOrder];
    const [moved] = nextOrder.splice(index, 1);
    nextOrder.splice(targetIndex, 0, moved);

    setSchema((prev) => ({
      ...prev,
      field_order: nextOrder,
    }));
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, _index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) return;

    const nextOrder = [...activeOrder];
    const [moved] = nextOrder.splice(draggedIndex, 1);
    nextOrder.splice(targetIndex, 0, moved);

    setSchema((prev) => ({
      ...prev,
      field_order: nextOrder,
    }));
    setDraggedIndex(null);
  };

  const handleAddCustomField = () => {
    const newId = `custom_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newField: CustomFormField = {
      id: newId,
      label: 'New Custom Question',
      type: 'text',
      placeholder: 'Enter response here...',
      required: false,
    };
    setSchema((prev) => ({
      ...prev,
      custom_fields: [...(prev.custom_fields || []), newField],
      field_order: [...activeOrder, newId],
    }));
  };

  const handleUpdateCustomField = (id: string, updates: Partial<CustomFormField>) => {
    setSchema((prev) => {
      const copy = (prev.custom_fields || []).map((cf) => {
        if (cf.id === id) {
          return { ...cf, ...updates };
        }
        return cf;
      });

      let nextOrder = prev.field_order;
      if (updates.id && updates.id !== id && nextOrder) {
        nextOrder = nextOrder.map((k) => (k === id ? updates.id! : k));
      }

      return {
        ...prev,
        custom_fields: copy,
        ...(nextOrder ? { field_order: nextOrder } : {}),
      };
    });
  };

  const handleDeleteCustomField = (id: string) => {
    setSchema((prev) => {
      const copy = (prev.custom_fields || []).filter((cf) => cf.id !== id);
      return {
        ...prev,
        custom_fields: copy,
        field_order: activeOrder.filter((k) => k !== id),
      };
    });
  };

  const handleResetToDefault = () => {
    const defaultData = DEFAULT_COMPANY_SCHEMA;
    if (confirm('Reset form configuration to default template?')) {
      setSchema(JSON.parse(JSON.stringify(defaultData)));
      toast.success('Reset form to default template');
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2.5 rounded-full hover:bg-slate-100 text-slate-600 transition"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider bg-purple-100 text-kulkul-purple">
              {program.name}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex bg-slate-100 p-1 rounded-full border border-slate-200">
            <button
              onClick={() => setActiveTab('editor')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'editor'
                  ? 'bg-white text-kulkul-purple shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Form Editor</span>
            </button>
            <button
              onClick={() => setActiveTab('preview')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'preview'
                  ? 'bg-white text-kulkul-purple shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Live Preview</span>
            </button>
          </div>

          <button
            onClick={handleResetToDefault}
            className="px-3.5 py-2 rounded-full border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold transition flex items-center gap-1.5"
            title="Reset to default format"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
            <span>Reset to Default</span>
          </button>

          <button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="px-5 py-2 rounded-full bg-kulkul-purple hover:bg-purple-700 text-white text-xs font-extrabold shadow-sm transition flex items-center gap-2 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saveMutation.isPending ? 'Saving...' : 'Save Form'}</span>
          </button>
        </div>
      </div>

      {activeTab === 'editor' ? (
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Section: General Header & Copy */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-2xs space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Settings className="w-4 h-4 text-kulkul-purple" />
              <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                Page Header & Copy
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-2xs font-extrabold uppercase text-slate-500 mb-1">
                  Form Title
                </label>
                <input
                  type="text"
                  value={schema.title || ''}
                  onChange={(e) => setSchema({ ...schema, title: e.target.value })}
                  placeholder="Candidate Application"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-kulkul-purple/20 focus:border-kulkul-purple"
                />
              </div>

              <div>
                <label className="block text-2xs font-extrabold uppercase text-slate-500 mb-1">
                  Description / Instructions
                </label>
                <textarea
                  rows={2}
                  value={schema.description || ''}
                  onChange={(e) => setSchema({ ...schema, description: e.target.value })}
                  placeholder="Explain what the applicant needs to submit..."
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-kulkul-purple/20 focus:border-kulkul-purple"
                />
              </div>

              <div>
                <label className="block text-2xs font-extrabold uppercase text-slate-500 mb-1">
                  Submit Button Text
                </label>
                <input
                  type="text"
                  value={schema.submit_button_text || ''}
                  onChange={(e) => setSchema({ ...schema, submit_button_text: e.target.value })}
                  placeholder="Submit Application"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-kulkul-purple/20 focus:border-kulkul-purple"
                />
              </div>
            </div>
          </div>

          {/* Section: Standard Intake Fields Toggle Palette */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-kulkul-purple" />
                <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                  Standard Intake Fields
                </h2>
              </div>
              <span className="text-2xs text-slate-400 font-medium">
                Check to enable standard fields into your active questions sequence below
              </span>
            </div>

            {/* Identity Note */}
            <div className="p-3.5 rounded-2xl bg-purple-50/60 border border-purple-100 text-xs text-purple-950 flex items-start gap-2.5">
              <CheckCircle className="w-4 h-4 text-kulkul-purple shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Core Credentials (Fixed at top)</span>
                <p className="text-3xs text-purple-800 mt-0.5 leading-relaxed">
                  <strong>First Name</strong>, <strong>Last Name</strong>, and <strong>Email Address</strong> are always enabled and required as core applicant identity.
                </p>
              </div>
            </div>

            {/* Quick Toggle Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {STANDARD_FIELD_KEYS.map((key) => {
                const meta = STANDARD_FIELD_METADATA[key];
                const cfg = schema.fields?.[key] || { enabled: false, required: false };
                const orderIndex = activeOrder.indexOf(key);
                const isEnabled = Boolean(cfg.enabled);

                return (
                  <div
                    key={key}
                    onClick={() => handleToggleStandardField(key, !isEnabled)}
                    className={`p-3.5 rounded-2xl border transition cursor-pointer flex items-start justify-between gap-3 ${
                      isEnabled
                        ? 'border-purple-200 bg-purple-50/30 shadow-xs'
                        : 'border-slate-200/80 bg-slate-50/50 hover:bg-slate-50 text-slate-500'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        checked={isEnabled}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleToggleStandardField(key, e.target.checked);
                        }}
                        className="w-4 h-4 mt-0.5 text-kulkul-purple rounded border-slate-300 focus:ring-kulkul-purple cursor-pointer"
                      />
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-xs font-bold ${isEnabled ? 'text-slate-900' : 'text-slate-600'}`}>
                            {meta.label}
                          </span>
                          {isEnabled && cfg.required && (
                            <span className="text-rose-500 font-bold text-xs" title="Required">*</span>
                          )}
                        </div>
                        <p className="text-3xs text-slate-400 mt-0.5 line-clamp-1">{meta.description}</p>
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      {isEnabled ? (
                        <span className="inline-block px-2 py-0.5 rounded-full text-3xs font-extrabold bg-purple-100 text-kulkul-purple">
                          Position #{orderIndex + 1}
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 rounded-full text-3xs font-semibold bg-slate-200/60 text-slate-500">
                          Disabled
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section: Unified Ordered Questions & Form Sequence */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-2xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-kulkul-purple" />
                  <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                    Form Questions & Layout Order
                  </h2>
                  <span className="px-2 py-0.5 rounded-full text-2xs font-extrabold bg-slate-100 text-slate-700">
                    {activeOrder.length} Active {activeOrder.length === 1 ? 'Field' : 'Fields'}
                  </span>
                </div>
                <p className="text-2xs text-slate-500 mt-0.5">
                  Use the <strong>↑ Move Up</strong> and <strong>↓ Move Down</strong> buttons (or drag) to reorder standard intake fields and custom questions in the exact order candidates will answer them.
                </p>
              </div>

              <button
                type="button"
                onClick={handleAddCustomField}
                className="px-3.5 py-1.5 rounded-full bg-purple-50 hover:bg-purple-100 text-kulkul-purple border border-purple-200 text-xs font-bold transition flex items-center gap-1.5 shrink-0 shadow-2xs self-start sm:self-auto"
              >
                <Plus className="w-3.5 h-3.5 text-kulkul-orange" />
                <span>Add Custom Question</span>
              </button>
            </div>

            {activeOrder.length === 0 ? (
              <div className="text-center py-10 px-4 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-700">No active fields or questions</p>
                <p className="text-3xs text-slate-400 mt-0.5 max-w-sm mx-auto">
                  Check any standard intake field above to enable it into this form flow, or click the button below to add custom role-specific questions.
                </p>
                <button
                  type="button"
                  onClick={handleAddCustomField}
                  className="mt-3 px-4 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-bold text-kulkul-purple hover:bg-purple-50 transition inline-flex items-center gap-1.5 shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Custom Question</span>
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {activeOrder.map((fieldKey, index) => {
                  const isStandard = fieldKey in STANDARD_FIELD_METADATA;

                  if (isStandard) {
                    const stdKey = fieldKey as StandardFieldKey;
                    const meta = STANDARD_FIELD_METADATA[stdKey];
                    const cfg = schema.fields?.[stdKey] || { enabled: true, required: false };
                    const isExpanded = expandedOptionField === stdKey;

                    return (
                      <div
                        key={stdKey}
                        draggable
                        onDragStart={(e) => handleDragStart(e, index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDrop={(e) => handleDrop(e, index)}
                        className={`p-4 rounded-2xl border transition bg-white shadow-2xs ${
                          draggedIndex === index
                            ? 'opacity-40 border-dashed border-purple-400'
                            : 'border-slate-200/90 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div
                              className="cursor-grab active:cursor-grabbing p-1 text-slate-400 hover:text-slate-600 rounded"
                              title="Drag to reorder"
                            >
                              <GripVertical className="w-4 h-4" />
                            </div>

                            <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-3xs font-extrabold text-slate-700 shrink-0">
                              #{index + 1}
                            </span>

                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold text-slate-900">{meta.label}</span>
                                <span className="px-2 py-0.5 rounded-md text-3xs font-extrabold bg-blue-50 text-blue-700 border border-blue-200/60">
                                  Standard Intake Field
                                </span>
                                {cfg.required && (
                                  <span className="px-1.5 py-0.2 rounded text-3xs font-bold bg-rose-50 text-rose-600 border border-rose-200">
                                    Required
                                  </span>
                                )}
                              </div>
                              <p className="text-3xs text-slate-400 mt-0.5">{meta.description}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0 flex-wrap">
                            {meta.hasOptions && (
                              <button
                                type="button"
                                onClick={() => setExpandedOptionField(isExpanded ? null : stdKey)}
                                className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-3xs font-bold text-kulkul-purple hover:bg-purple-50"
                              >
                                {isExpanded ? 'Hide Choices' : `Edit Choices (${cfg.options?.length || 0})`}
                              </button>
                            )}

                            <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-slate-700 px-2 py-1 rounded-lg hover:bg-slate-50">
                              <input
                                type="checkbox"
                                checked={cfg.required}
                                onChange={(e) => handleToggleStandardRequired(stdKey, e.target.checked)}
                                className="w-4 h-4 text-rose-600 rounded border-slate-300 focus:ring-rose-500"
                              />
                              <span className="text-2xs">Required</span>
                            </label>

                            {/* Move Up / Down Buttons */}
                            <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200">
                              <button
                                type="button"
                                disabled={index === 0}
                                onClick={() => handleMoveField(index, 'up')}
                                className="p-1 text-slate-500 hover:text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed rounded hover:bg-white transition"
                                title="Move up"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={index === activeOrder.length - 1}
                                onClick={() => handleMoveField(index, 'down')}
                                className="p-1 text-slate-500 hover:text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed rounded hover:bg-white transition"
                                title="Move down"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleToggleStandardField(stdKey, false)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition"
                              title="Disable standard field"
                            >
                              <EyeOff className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Collapsible Options Editor for Select Dropdowns */}
                        {meta.hasOptions && isExpanded && (
                          <div className="mt-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
                            <span className="text-2xs font-extrabold uppercase text-slate-500 block">
                              Dropdown Choices for {meta.label}
                            </span>
                            <div className="space-y-1.5">
                              {(cfg.options || []).map((opt, optIdx) => (
                                <div key={optIdx} className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    value={opt}
                                    onChange={(e) => {
                                      const nextOpts = [...(cfg.options || [])];
                                      nextOpts[optIdx] = e.target.value;
                                      setSchema((prev) => ({
                                        ...prev,
                                        fields: {
                                          ...(prev.fields || {}),
                                          [stdKey]: { ...prev.fields?.[stdKey], options: nextOpts },
                                        },
                                      }));
                                    }}
                                    className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-800"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const nextOpts = (cfg.options || []).filter((_, idx) => idx !== optIdx);
                                      setSchema((prev) => ({
                                        ...prev,
                                        fields: {
                                          ...(prev.fields || {}),
                                          [stdKey]: { ...prev.fields?.[stdKey], options: nextOpts },
                                        },
                                      }));
                                    }}
                                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))}
                              <button
                                type="button"
                                onClick={() => {
                                  const nextOpts = [...(cfg.options || []), 'New Choice'];
                                  setSchema((prev) => ({
                                    ...prev,
                                    fields: {
                                      ...(prev.fields || {}),
                                      [stdKey]: { ...prev.fields?.[stdKey], options: nextOpts },
                                    },
                                  }));
                                }}
                                className="mt-1 px-3 py-1 rounded-lg bg-white border border-slate-200 text-3xs font-bold text-kulkul-purple hover:bg-purple-50 transition flex items-center gap-1"
                              >
                                <Plus className="w-3 h-3" />
                                <span>Add Choice</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }

                  // Custom Question Card
                  const customField = (schema.custom_fields || []).find((cf) => cf.id === fieldKey);
                  if (!customField) return null;

                  return (
                    <div
                      key={customField.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDrop={(e) => handleDrop(e, index)}
                      className={`p-4 rounded-2xl border transition bg-amber-50/20 shadow-2xs space-y-3.5 ${
                        draggedIndex === index
                          ? 'opacity-40 border-dashed border-purple-400'
                          : 'border-amber-200/80 hover:border-amber-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="cursor-grab active:cursor-grabbing p-1 text-slate-400 hover:text-slate-600 rounded"
                            title="Drag to reorder"
                          >
                            <GripVertical className="w-4 h-4" />
                          </div>

                          <span className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center text-3xs font-extrabold text-amber-900 shrink-0">
                            #{index + 1}
                          </span>

                          <span className="px-2 py-0.5 rounded-md text-3xs font-extrabold bg-amber-100 text-amber-900 border border-amber-300/60">
                            Custom Question • {customField.type.toUpperCase()}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-slate-700 px-2 py-1 rounded-lg hover:bg-white/60">
                            <input
                              type="checkbox"
                              checked={customField.required}
                              onChange={(e) => handleUpdateCustomField(customField.id, { required: e.target.checked })}
                              className="w-4 h-4 text-rose-600 rounded border-slate-300 focus:ring-rose-500"
                            />
                            <span className="text-2xs">Required</span>
                          </label>

                          {/* Move Up / Down Buttons */}
                          <div className="flex items-center bg-white rounded-lg p-0.5 border border-slate-200 shadow-2xs">
                            <button
                              type="button"
                              disabled={index === 0}
                              onClick={() => handleMoveField(index, 'up')}
                              className="p-1 text-slate-500 hover:text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed rounded hover:bg-slate-100 transition"
                              title="Move up"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={index === activeOrder.length - 1}
                              onClick={() => handleMoveField(index, 'down')}
                              className="p-1 text-slate-500 hover:text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed rounded hover:bg-slate-100 transition"
                              title="Move down"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleDeleteCustomField(customField.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition"
                            title="Delete custom question"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="sm:col-span-2">
                          <label className="block text-2xs font-extrabold uppercase text-slate-500 mb-1">
                            Question Title / Prompt
                          </label>
                          <input
                            type="text"
                            value={customField.label}
                            onChange={(e) => handleUpdateCustomField(customField.id, { label: e.target.value })}
                            placeholder="e.g., Portfolio link, Years of experience..."
                            className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-kulkul-purple/20 focus:border-kulkul-purple"
                          />
                        </div>

                        <div>
                          <label className="block text-2xs font-extrabold uppercase text-slate-500 mb-1">
                            Answer Type
                          </label>
                          <select
                            value={customField.type}
                            onChange={(e) =>
                              handleUpdateCustomField(customField.id, {
                                type: e.target.value as FormFieldType,
                                options:
                                  e.target.value === 'select' || e.target.value === 'radio'
                                    ? customField.options && customField.options.length > 0
                                      ? customField.options
                                      : ['Option 1', 'Option 2']
                                    : undefined,
                              })
                            }
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-kulkul-purple/20 focus:border-kulkul-purple"
                          >
                            <option value="text">Short Text</option>
                            <option value="textarea">Paragraph / Essay</option>
                            <option value="select">Dropdown Select</option>
                            <option value="radio">Radio Buttons</option>
                            <option value="url">Website / URL</option>
                            <option value="number">Number</option>
                            <option value="file">File Upload</option>
                          </select>
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-2xs font-extrabold uppercase text-slate-500 mb-1">
                            Placeholder Text (Optional)
                          </label>
                          <input
                            type="text"
                            value={customField.placeholder || ''}
                            onChange={(e) => handleUpdateCustomField(customField.id, { placeholder: e.target.value })}
                            placeholder="e.g. https://github.com/..."
                            className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs text-slate-800"
                          />
                        </div>

                        <div>
                          <label className="block text-2xs font-extrabold uppercase text-slate-500 mb-1">
                            Field ID Key
                          </label>
                          <input
                            type="text"
                            value={customField.id}
                            onChange={(e) =>
                              handleUpdateCustomField(customField.id, {
                                id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
                              })
                            }
                            className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-mono text-slate-600"
                          />
                        </div>
                      </div>

                      {/* Choices Editor for select / radio */}
                      {(customField.type === 'select' || customField.type === 'radio') && (
                        <div className="p-3.5 bg-white rounded-xl border border-slate-200 space-y-2">
                          <span className="text-2xs font-extrabold uppercase text-slate-500 block">
                            Choice Options
                          </span>
                          <div className="space-y-1.5">
                            {(customField.options || []).map((opt, optIdx) => (
                              <div key={optIdx} className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={opt}
                                  onChange={(e) => {
                                    const nextOpts = [...(customField.options || [])];
                                    nextOpts[optIdx] = e.target.value;
                                    handleUpdateCustomField(customField.id, { options: nextOpts });
                                  }}
                                  className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-800"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextOpts = (customField.options || []).filter((_, i) => i !== optIdx);
                                    handleUpdateCustomField(customField.id, { options: nextOpts });
                                  }}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() => {
                                const nextOpts = [
                                  ...(customField.options || []),
                                  `Option ${(customField.options?.length || 0) + 1}`,
                                ];
                                handleUpdateCustomField(customField.id, { options: nextOpts });
                              }}
                              className="mt-1 px-3 py-1 rounded-lg bg-slate-50 border border-slate-200 text-3xs font-bold text-kulkul-purple hover:bg-purple-50 transition flex items-center gap-1"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Add Choice</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Live Preview Tab - Dynamic Sequence */
        <div className="bg-slate-50 p-6 md:p-10 rounded-3xl border border-slate-200/80">
          <div className="max-w-2xl mx-auto bg-white rounded-3xl p-8 shadow-sm border border-slate-200/70 space-y-6">
            <div className="border-b border-slate-100 pb-5">
              <span className="text-2xs font-extrabold uppercase text-kulkul-purple bg-purple-100/70 px-2.5 py-0.5 rounded-full">
                Candidate View Preview
              </span>
              <h2 className="text-xl font-extrabold text-slate-900 mt-2">{schema.title || 'Candidate Application'}</h2>
              <p className="text-xs text-slate-500 mt-1">{schema.description}</p>
            </div>

            {/* Core Identity Credentials (Always Top) */}
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-2xs font-bold uppercase text-slate-500 mb-1">
                    First Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    disabled
                    value="Jane"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-600"
                  />
                </div>
                <div>
                  <label className="block text-2xs font-bold uppercase text-slate-500 mb-1">
                    Last Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    disabled
                    value="Doe"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-2xs font-bold uppercase text-slate-500 mb-1">
                  Email Address <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  disabled
                  value="jane.doe@example.com"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-600"
                />
              </div>

              {/* Dynamic Questions Rendered in Exact Custom Order */}
              {activeOrder.map((key) => {
                if (key === 'phone') {
                  const req = schema.fields?.phone?.required;
                  return (
                    <div key="phone">
                      <label className="block text-2xs font-bold uppercase text-slate-500 mb-1">
                        Phone / WhatsApp {req && <span className="text-rose-500">*</span>}
                      </label>
                      <input
                        type="text"
                        disabled
                        placeholder="+62 812 3456 7890"
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-600"
                      />
                    </div>
                  );
                }

                if (key === 'date_of_birth') {
                  const req = schema.fields?.date_of_birth?.required;
                  return (
                    <div key="date_of_birth">
                      <label className="block text-2xs font-bold uppercase text-slate-500 mb-1">
                        Date of Birth {req && <span className="text-rose-500">*</span>}
                      </label>
                      <input
                        type="date"
                        disabled
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-600"
                      />
                    </div>
                  );
                }

                if (key === 'university') {
                  const req = schema.fields?.university?.required;
                  return (
                    <div key="university">
                      <label className="block text-2xs font-bold uppercase text-slate-500 mb-1">
                        University / Campus {req && <span className="text-rose-500">*</span>}
                      </label>
                      <input
                        type="text"
                        disabled
                        placeholder="e.g. Universitas Indonesia"
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-600"
                      />
                    </div>
                  );
                }

                if (key === 'major') {
                  const req = schema.fields?.major?.required;
                  const opts = schema.fields?.major?.options || [];
                  return (
                    <div key="major">
                      <label className="block text-2xs font-bold uppercase text-slate-500 mb-1">
                        Major / Study Field {req && <span className="text-rose-500">*</span>}
                      </label>
                      <select disabled className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-600">
                        <option>Select major...</option>
                        {opts.map((o, idx) => (
                          <option key={idx}>{o}</option>
                        ))}
                      </select>
                    </div>
                  );
                }

                if (key === 'semester') {
                  const req = schema.fields?.semester?.required;
                  const opts = schema.fields?.semester?.options || [];
                  return (
                    <div key="semester">
                      <label className="block text-2xs font-bold uppercase text-slate-500 mb-1">
                        Semester / Academic Level {req && <span className="text-rose-500">*</span>}
                      </label>
                      <select disabled className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-600">
                        <option>Select semester...</option>
                        {opts.map((o, idx) => (
                          <option key={idx}>{o}</option>
                        ))}
                      </select>
                    </div>
                  );
                }

                if (key === 'referral_source') {
                  const req = schema.fields?.referral_source?.required;
                  const opts = schema.fields?.referral_source?.options || [];
                  return (
                    <div key="referral_source">
                      <label className="block text-2xs font-bold uppercase text-slate-500 mb-1">
                        How did you hear about us? {req && <span className="text-rose-500">*</span>}
                      </label>
                      <select disabled className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-600">
                        <option>Select referral source...</option>
                        {opts.map((o, idx) => (
                          <option key={idx}>{o}</option>
                        ))}
                      </select>
                    </div>
                  );
                }

                if (key === 'linkedin_url') {
                  const req = schema.fields?.linkedin_url?.required;
                  return (
                    <div key="linkedin_url">
                      <label className="block text-2xs font-bold uppercase text-slate-500 mb-1">
                        LinkedIn Profile {req && <span className="text-rose-500">*</span>}
                      </label>
                      <input
                        type="url"
                        disabled
                        placeholder="https://linkedin.com/in/..."
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-600"
                      />
                    </div>
                  );
                }

                if (key === 'github_url') {
                  const req = schema.fields?.github_url?.required;
                  return (
                    <div key="github_url">
                      <label className="block text-2xs font-bold uppercase text-slate-500 mb-1">
                        GitHub Profile {req && <span className="text-rose-500">*</span>}
                      </label>
                      <input
                        type="url"
                        disabled
                        placeholder="https://github.com/..."
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-600"
                      />
                    </div>
                  );
                }

                if (key === 'profile_picture') {
                  const req = schema.fields?.profile_picture?.required;
                  return (
                    <div key="profile_picture">
                      <label className="block text-2xs font-bold uppercase text-slate-500 mb-1">
                        Profile Photo {req && <span className="text-rose-500">*</span>}
                      </label>
                      <div className="p-4 border border-dashed border-slate-300 rounded-xl text-center bg-slate-50 text-slate-500">
                        <Upload className="w-5 h-5 mx-auto mb-1 text-slate-400" />
                        <span>Click to browse profile photo</span>
                      </div>
                    </div>
                  );
                }

                if (key === 'resume') {
                  const req = schema.fields?.resume?.required;
                  return (
                    <div key="resume">
                      <label className="block text-2xs font-bold uppercase text-slate-500 mb-1">
                        Resume / CV (PDF) {req && <span className="text-rose-500">*</span>}
                      </label>
                      <div className="p-4 border border-dashed border-slate-300 rounded-xl text-center bg-slate-50 text-slate-500">
                        <Upload className="w-5 h-5 mx-auto mb-1 text-slate-400" />
                        <span>Click to browse or drag and drop your Resume PDF</span>
                      </div>
                    </div>
                  );
                }

                // Custom Question Preview
                const cf = (schema.custom_fields || []).find((c) => c.id === key);
                if (!cf) return null;

                return (
                  <div key={cf.id} className="space-y-1">
                    <label className="block text-2xs font-bold uppercase text-slate-600">
                      {cf.label} {cf.required && <span className="text-rose-500">*</span>}
                    </label>

                    {cf.type === 'textarea' ? (
                      <textarea
                        disabled
                        rows={3}
                        placeholder={cf.placeholder || 'Enter your response...'}
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-600"
                      />
                    ) : cf.type === 'select' ? (
                      <select disabled className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-600">
                        <option>{cf.placeholder || 'Select option...'}</option>
                        {(cf.options || []).map((o, optIdx) => (
                          <option key={optIdx}>{o}</option>
                        ))}
                      </select>
                    ) : cf.type === 'radio' ? (
                      <div className="space-y-1.5 pt-1">
                        {(cf.options || []).map((o, optIdx) => (
                          <label key={optIdx} className="flex items-center gap-2 text-xs text-slate-700">
                            <input type="radio" disabled name={cf.id} />
                            <span>{o}</span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <input
                        type={cf.type === 'number' ? 'number' : cf.type === 'url' ? 'url' : 'text'}
                        disabled
                        placeholder={cf.placeholder || ''}
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-600"
                      />
                    )}
                  </div>
                );
              })}

              <button
                type="button"
                disabled
                className="w-full mt-4 py-3 rounded-2xl bg-kulkul-purple text-white text-xs font-bold shadow-sm opacity-90 cursor-not-allowed text-center"
              >
                {schema.submit_button_text || 'Submit Application'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
