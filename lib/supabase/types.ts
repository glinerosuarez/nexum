export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      activities: {
        Row: {
          cantidad_ejecutada: number;
          cantidad_planeada: number;
          created_at: string;
          descripcion: string | null;
          id: string;
          nombre: string;
          phase_id: string;
          progress_percentage: number | null;
          sort_order: number;
          unidad_medida: string;
          updated_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      activity_supplies: {
        Row: {
          activity_id: string;
          cantidad_ejecutada: number;
          cantidad_planeada: number;
          created_at: string;
          id: string;
          precio_unitario: number;
          subtotal: number | null;
          supply_id: string;
          updated_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      budget_snapshots: {
        Row: {
          approved_at: string | null;
          approved_by: string | null;
          created_at: string;
          estado: Database["public"]["Enums"]["budget_snapshot_status"];
          id: string;
          notes: string | null;
          project_id: string;
          snapshot_date: string;
          total_budget: number;
          updated_at: string;
          version_number: number;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      profiles: {
        Row: {
          active: boolean;
          created_at: string;
          email: string | null;
          full_name: string;
          id: string;
          job_title: string | null;
          phone: string | null;
          updated_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      project_memberships: {
        Row: {
          active: boolean;
          assigned_at: string;
          created_at: string;
          id: string;
          profile_id: string;
          project_id: string;
          role: Database["public"]["Enums"]["project_role"];
          updated_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      project_phases: {
        Row: {
          created_at: string;
          descripcion: string | null;
          id: string;
          nombre: string;
          project_id: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      projects: {
        Row: {
          created_at: string;
          descripcion: string | null;
          estado: Database["public"]["Enums"]["project_status"];
          fecha_fin_planeada: string | null;
          fecha_fin_real: string | null;
          fecha_inicio_planeada: string | null;
          fecha_inicio_real: string | null;
          id: string;
          nombre: string;
          presupuesto_total: number;
          ubicacion: string | null;
          updated_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      purchase_orders: {
        Row: {
          created_at: string;
          created_by: string | null;
          estado: Database["public"]["Enums"]["purchase_order_status"];
          fecha_emision: string;
          fecha_entrega_esperada: string | null;
          id: string;
          notes: string | null;
          order_number: string;
          project_id: string;
          supplier_id: string;
          updated_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      purchase_order_items: {
        Row: {
          cantidad: number;
          created_at: string;
          es_prioritario: boolean;
          id: string;
          precio_unitario: number;
          purchase_order_id: string;
          subtotal: number | null;
          supply_id: string;
          updated_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      supplier_payments: {
        Row: {
          comprobante_url: string | null;
          created_at: string;
          estado: Database["public"]["Enums"]["supplier_payment_status"];
          fecha_pago: string | null;
          id: string;
          metodo_pago: string | null;
          monto: number;
          purchase_order_id: string;
          updated_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      suppliers: {
        Row: {
          activo: boolean;
          contacto: string | null;
          created_at: string;
          direccion: string | null;
          email: string | null;
          id: string;
          nit_rut: string;
          nombre: string;
          telefono: string | null;
          updated_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      supply_availability_alerts: {
        Row: {
          created_at: string;
          disponibilidad: Database["public"]["Enums"]["supply_availability"];
          estado: Database["public"]["Enums"]["alert_status"];
          id: string;
          mensaje: string;
          resolved_at: string | null;
          supply_id: string;
          updated_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      supply_catalog: {
        Row: {
          activo: boolean;
          created_at: string;
          descripcion: string | null;
          disponibilidad: Database["public"]["Enums"]["supply_availability"];
          es_critico: boolean;
          id: string;
          nombre: string;
          precio_referencia: number;
          tipo: Database["public"]["Enums"]["supply_type"];
          unidad_medida: string;
          updated_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      payroll_periods: {
        Row: {
          created_at: string;
          fecha_fin: string;
          fecha_inicio: string;
          id: string;
          project_id: string;
          updated_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      payroll_entries: {
        Row: {
          bonificaciones: number;
          created_at: string;
          deducciones: number;
          id: string;
          payroll_period_id: string;
          profile_id: string;
          salario_base: number;
          total_neto: number | null;
          updated_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      incidents: {
        Row: {
          activity_id: string | null;
          created_at: string;
          descripcion: string;
          estado: Database["public"]["Enums"]["incident_status"];
          fecha_cierre: string | null;
          fecha_ocurrencia: string;
          id: string;
          project_id: string;
          reportado_por: string | null;
          severidad: Database["public"]["Enums"]["incident_severity"];
          tipo: Database["public"]["Enums"]["incident_type"];
          updated_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
    };
    Views: {
      management_report_data: {
        Row: {
          alertas_insumos_criticos: Json | null;
          avance_global_percent: number | null;
          avance_planeado_percent: number | null;
          cpi_basico: number | null;
          dias_planeados: number | null;
          dias_transcurridos: number | null;
          estado: Database["public"]["Enums"]["project_status"] | null;
          gasto_ejecutado: number | null;
          incidentes_abiertos: number | null;
          presupuesto_apu: number | null;
          presupuesto_total: number | null;
          presupuesto_total_registrado: number | null;
          project_id: string | null;
          project_nombre: string | null;
          spi_basico: number | null;
        };
        Relationships: [];
      };
    };
    Functions: Record<string, never>;
    Enums: {
      alert_status: "abierta" | "resuelta";
      budget_snapshot_status: "borrador" | "aprobado";
      incident_action_status:
        | "pendiente"
        | "en_progreso"
        | "completada"
        | "cancelada";
      incident_severity: "baja" | "media" | "alta" | "critica";
      incident_status: "abierto" | "en_revision" | "cerrado";
      incident_type: "incidente" | "no_conformidad" | "observacion";
      project_role:
        | "director_proyecto"
        | "residente_obra"
        | "residente_administrativo";
      project_status:
        | "planificacion"
        | "en_ejecucion"
        | "pausado"
        | "finalizado"
        | "cancelado";
      purchase_order_status:
        | "borrador"
        | "enviada"
        | "aprobada"
        | "recibida"
        | "cancelada";
      schedule_item_status:
        | "pendiente"
        | "en_progreso"
        | "completado"
        | "retrasado"
        | "cancelado";
      supplier_payment_status: "pendiente" | "pagado" | "anulado";
      supply_availability: "disponible" | "escaso" | "agotado" | "descontinuado";
      supply_type: "material" | "equipo" | "mano_obra" | "subcontrato";
    };
    CompositeTypes: Record<string, never>;
  };
};
