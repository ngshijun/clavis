export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '13.0.5'
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      announcement_reads: {
        Row: {
          announcement_id: string
          id: string
          read_at: string | null
          user_id: string
        }
        Insert: {
          announcement_id: string
          id?: string
          read_at?: string | null
          user_id: string
        }
        Update: {
          announcement_id?: string
          id?: string
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'announcement_reads_announcement_id_fkey'
            columns: ['announcement_id']
            isOneToOne: false
            referencedRelation: 'announcements'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'announcement_reads_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'leaderboard'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'announcement_reads_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      announcements: {
        Row: {
          content: string
          created_at: string | null
          created_by: string
          expires_at: string | null
          id: string
          image_path: string | null
          is_pinned: boolean
          target_audience: Database['public']['Enums']['announcement_audience']
          title: string
          updated_at: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          created_by: string
          expires_at?: string | null
          id?: string
          image_path?: string | null
          is_pinned?: boolean
          target_audience?: Database['public']['Enums']['announcement_audience']
          title: string
          updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          created_by?: string
          expires_at?: string | null
          id?: string
          image_path?: string | null
          is_pinned?: boolean
          target_audience?: Database['public']['Enums']['announcement_audience']
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'announcements_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'leaderboard'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'announcements_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      child_subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          id: string
          is_active: boolean | null
          next_billing_date: string | null
          parent_id: string
          scheduled_change_date: string | null
          scheduled_tier: Database['public']['Enums']['subscription_tier'] | null
          start_date: string
          stripe_price_id: string | null
          stripe_schedule_id: string | null
          stripe_status: string | null
          stripe_subscription_id: string | null
          student_id: string
          tier: Database['public']['Enums']['subscription_tier']
          updated_at: string | null
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          is_active?: boolean | null
          next_billing_date?: string | null
          parent_id: string
          scheduled_change_date?: string | null
          scheduled_tier?: Database['public']['Enums']['subscription_tier'] | null
          start_date?: string
          stripe_price_id?: string | null
          stripe_schedule_id?: string | null
          stripe_status?: string | null
          stripe_subscription_id?: string | null
          student_id: string
          tier?: Database['public']['Enums']['subscription_tier']
          updated_at?: string | null
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          is_active?: boolean | null
          next_billing_date?: string | null
          parent_id?: string
          scheduled_change_date?: string | null
          scheduled_tier?: Database['public']['Enums']['subscription_tier'] | null
          start_date?: string
          stripe_price_id?: string | null
          stripe_schedule_id?: string | null
          stripe_status?: string | null
          stripe_subscription_id?: string | null
          student_id?: string
          tier?: Database['public']['Enums']['subscription_tier']
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'child_subscriptions_parent_id_fkey'
            columns: ['parent_id']
            isOneToOne: false
            referencedRelation: 'leaderboard'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'child_subscriptions_parent_id_fkey'
            columns: ['parent_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'child_subscriptions_student_id_fkey'
            columns: ['student_id']
            isOneToOne: true
            referencedRelation: 'leaderboard'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'child_subscriptions_student_id_fkey'
            columns: ['student_id']
            isOneToOne: true
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      daily_statuses: {
        Row: {
          created_at: string | null
          date: string
          has_practiced: boolean | null
          has_spun: boolean | null
          id: string
          mood: Database['public']['Enums']['mood_type'] | null
          spin_reward: number | null
          student_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          date?: string
          has_practiced?: boolean | null
          has_spun?: boolean | null
          id?: string
          mood?: Database['public']['Enums']['mood_type'] | null
          spin_reward?: number | null
          student_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          date?: string
          has_practiced?: boolean | null
          has_spun?: boolean | null
          id?: string
          mood?: Database['public']['Enums']['mood_type'] | null
          spin_reward?: number | null
          student_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'daily_statuses_student_id_fkey'
            columns: ['student_id']
            isOneToOne: false
            referencedRelation: 'leaderboard'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'daily_statuses_student_id_fkey'
            columns: ['student_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      grade_levels: {
        Row: {
          created_at: string | null
          display_order: number | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          display_order?: number | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          display_order?: number | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      owned_pets: {
        Row: {
          count: number | null
          created_at: string | null
          food_fed: number
          id: string
          pet_id: string
          student_id: string
          tier: number
          updated_at: string | null
        }
        Insert: {
          count?: number | null
          created_at?: string | null
          food_fed?: number
          id?: string
          pet_id: string
          student_id: string
          tier?: number
          updated_at?: string | null
        }
        Update: {
          count?: number | null
          created_at?: string | null
          food_fed?: number
          id?: string
          pet_id?: string
          student_id?: string
          tier?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'owned_pets_pet_id_fkey'
            columns: ['pet_id']
            isOneToOne: false
            referencedRelation: 'pets'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'owned_pets_student_id_fkey'
            columns: ['student_id']
            isOneToOne: false
            referencedRelation: 'leaderboard'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'owned_pets_student_id_fkey'
            columns: ['student_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      parent_profiles: {
        Row: {
          created_at: string | null
          id: string
          stripe_customer_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id: string
          stripe_customer_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          stripe_customer_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'parent_profiles_id_fkey'
            columns: ['id']
            isOneToOne: true
            referencedRelation: 'leaderboard'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'parent_profiles_id_fkey'
            columns: ['id']
            isOneToOne: true
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      parent_student_invitations: {
        Row: {
          created_at: string | null
          direction: Database['public']['Enums']['invitation_direction']
          id: string
          parent_email: string
          parent_id: string | null
          responded_at: string | null
          status: Database['public']['Enums']['invitation_status'] | null
          student_email: string
          student_id: string | null
        }
        Insert: {
          created_at?: string | null
          direction: Database['public']['Enums']['invitation_direction']
          id?: string
          parent_email: string
          parent_id?: string | null
          responded_at?: string | null
          status?: Database['public']['Enums']['invitation_status'] | null
          student_email: string
          student_id?: string | null
        }
        Update: {
          created_at?: string | null
          direction?: Database['public']['Enums']['invitation_direction']
          id?: string
          parent_email?: string
          parent_id?: string | null
          responded_at?: string | null
          status?: Database['public']['Enums']['invitation_status'] | null
          student_email?: string
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'parent_student_invitations_parent_id_fkey'
            columns: ['parent_id']
            isOneToOne: false
            referencedRelation: 'leaderboard'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'parent_student_invitations_parent_id_fkey'
            columns: ['parent_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'parent_student_invitations_student_id_fkey'
            columns: ['student_id']
            isOneToOne: false
            referencedRelation: 'leaderboard'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'parent_student_invitations_student_id_fkey'
            columns: ['student_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      parent_student_links: {
        Row: {
          id: string
          linked_at: string | null
          parent_id: string
          student_id: string
        }
        Insert: {
          id?: string
          linked_at?: string | null
          parent_id: string
          student_id: string
        }
        Update: {
          id?: string
          linked_at?: string | null
          parent_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'parent_student_links_parent_id_fkey'
            columns: ['parent_id']
            isOneToOne: false
            referencedRelation: 'leaderboard'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'parent_student_links_parent_id_fkey'
            columns: ['parent_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'parent_student_links_student_id_fkey'
            columns: ['student_id']
            isOneToOne: true
            referencedRelation: 'leaderboard'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'parent_student_links_student_id_fkey'
            columns: ['student_id']
            isOneToOne: true
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      payment_history: {
        Row: {
          amount_cents: number
          created_at: string | null
          currency: string
          description: string | null
          id: string
          metadata: Json | null
          parent_id: string
          status: string
          stripe_invoice_id: string | null
          stripe_payment_intent_id: string | null
          stripe_subscription_id: string | null
          student_id: string | null
          tier: Database['public']['Enums']['subscription_tier'] | null
        }
        Insert: {
          amount_cents: number
          created_at?: string | null
          currency?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          parent_id: string
          status: string
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_subscription_id?: string | null
          student_id?: string | null
          tier?: Database['public']['Enums']['subscription_tier'] | null
        }
        Update: {
          amount_cents?: number
          created_at?: string | null
          currency?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          parent_id?: string
          status?: string
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_subscription_id?: string | null
          student_id?: string | null
          tier?: Database['public']['Enums']['subscription_tier'] | null
        }
        Relationships: [
          {
            foreignKeyName: 'payment_history_parent_id_fkey'
            columns: ['parent_id']
            isOneToOne: false
            referencedRelation: 'leaderboard'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'payment_history_parent_id_fkey'
            columns: ['parent_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'payment_history_student_id_fkey'
            columns: ['student_id']
            isOneToOne: false
            referencedRelation: 'leaderboard'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'payment_history_student_id_fkey'
            columns: ['student_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      pets: {
        Row: {
          created_at: string | null
          id: string
          image_path: string
          name: string
          rarity: Database['public']['Enums']['pet_rarity']
          tier2_image_path: string | null
          tier3_image_path: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          image_path: string
          name: string
          rarity: Database['public']['Enums']['pet_rarity']
          tier2_image_path?: string | null
          tier3_image_path?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          image_path?: string
          name?: string
          rarity?: Database['public']['Enums']['pet_rarity']
          tier2_image_path?: string | null
          tier3_image_path?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      practice_answers: {
        Row: {
          answered_at: string | null
          id: string
          is_correct: boolean
          question_id: string | null
          selected_options: number[] | null
          session_id: string
          text_answer: string | null
          time_spent_seconds: number | null
        }
        Insert: {
          answered_at?: string | null
          id?: string
          is_correct: boolean
          question_id?: string | null
          selected_options?: number[] | null
          session_id: string
          text_answer?: string | null
          time_spent_seconds?: number | null
        }
        Update: {
          answered_at?: string | null
          id?: string
          is_correct?: boolean
          question_id?: string | null
          selected_options?: number[] | null
          session_id?: string
          text_answer?: string | null
          time_spent_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'practice_answers_question_id_fkey'
            columns: ['question_id']
            isOneToOne: false
            referencedRelation: 'question_statistics'
            referencedColumns: ['question_id']
          },
          {
            foreignKeyName: 'practice_answers_question_id_fkey'
            columns: ['question_id']
            isOneToOne: false
            referencedRelation: 'questions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'practice_answers_session_id_fkey'
            columns: ['session_id']
            isOneToOne: false
            referencedRelation: 'practice_sessions'
            referencedColumns: ['id']
          },
        ]
      }
      practice_sessions: {
        Row: {
          ai_summary: string | null
          coins_earned: number | null
          completed_at: string | null
          correct_count: number | null
          created_at: string | null
          current_question_index: number | null
          grade_level_id: string | null
          id: string
          student_id: string
          subject_id: string | null
          topic_id: string
          total_questions: number
          total_time_seconds: number | null
          xp_earned: number | null
        }
        Insert: {
          ai_summary?: string | null
          coins_earned?: number | null
          completed_at?: string | null
          correct_count?: number | null
          created_at?: string | null
          current_question_index?: number | null
          grade_level_id?: string | null
          id?: string
          student_id: string
          subject_id?: string | null
          topic_id: string
          total_questions: number
          total_time_seconds?: number | null
          xp_earned?: number | null
        }
        Update: {
          ai_summary?: string | null
          coins_earned?: number | null
          completed_at?: string | null
          correct_count?: number | null
          created_at?: string | null
          current_question_index?: number | null
          grade_level_id?: string | null
          id?: string
          student_id?: string
          subject_id?: string | null
          topic_id?: string
          total_questions?: number
          total_time_seconds?: number | null
          xp_earned?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'practice_sessions_grade_level_id_fkey'
            columns: ['grade_level_id']
            isOneToOne: false
            referencedRelation: 'grade_levels'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'practice_sessions_student_id_fkey'
            columns: ['student_id']
            isOneToOne: false
            referencedRelation: 'leaderboard'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'practice_sessions_student_id_fkey'
            columns: ['student_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'practice_sessions_subject_id_fkey'
            columns: ['subject_id']
            isOneToOne: false
            referencedRelation: 'subjects'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'practice_sessions_topic_id_fkey'
            columns: ['topic_id']
            isOneToOne: false
            referencedRelation: 'sub_topics'
            referencedColumns: ['id']
          },
        ]
      }
      processed_webhook_events: {
        Row: {
          event_id: string
          event_type: string
          processed_at: string
        }
        Insert: {
          event_id: string
          event_type: string
          processed_at?: string
        }
        Update: {
          event_id?: string
          event_type?: string
          processed_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_path: string | null
          created_at: string | null
          date_of_birth: string | null
          email: string
          has_completed_tour: boolean
          id: string
          name: string
          updated_at: string | null
          user_type: Database['public']['Enums']['user_type']
        }
        Insert: {
          avatar_path?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          email: string
          has_completed_tour?: boolean
          id: string
          name: string
          updated_at?: string | null
          user_type: Database['public']['Enums']['user_type']
        }
        Update: {
          avatar_path?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          email?: string
          has_completed_tour?: boolean
          id?: string
          name?: string
          updated_at?: string | null
          user_type?: Database['public']['Enums']['user_type']
        }
        Relationships: []
      }
      question_feedback: {
        Row: {
          category: Database['public']['Enums']['feedback_category']
          comments: string | null
          created_at: string | null
          id: string
          question_id: string
          reported_by: string
        }
        Insert: {
          category: Database['public']['Enums']['feedback_category']
          comments?: string | null
          created_at?: string | null
          id?: string
          question_id: string
          reported_by: string
        }
        Update: {
          category?: Database['public']['Enums']['feedback_category']
          comments?: string | null
          created_at?: string | null
          id?: string
          question_id?: string
          reported_by?: string
        }
        Relationships: [
          {
            foreignKeyName: 'question_feedback_question_id_fkey'
            columns: ['question_id']
            isOneToOne: false
            referencedRelation: 'question_statistics'
            referencedColumns: ['question_id']
          },
          {
            foreignKeyName: 'question_feedback_question_id_fkey'
            columns: ['question_id']
            isOneToOne: false
            referencedRelation: 'questions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'question_feedback_reported_by_fkey'
            columns: ['reported_by']
            isOneToOne: false
            referencedRelation: 'leaderboard'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'question_feedback_reported_by_fkey'
            columns: ['reported_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      questions: {
        Row: {
          answer: string | null
          created_at: string | null
          explanation: string | null
          grade_level_id: string | null
          id: string
          image_hash: string | null
          image_path: string | null
          option_1_image_path: string | null
          option_1_is_correct: boolean | null
          option_1_text: string | null
          option_2_image_path: string | null
          option_2_is_correct: boolean | null
          option_2_text: string | null
          option_3_image_path: string | null
          option_3_is_correct: boolean | null
          option_3_text: string | null
          option_4_image_path: string | null
          option_4_is_correct: boolean | null
          option_4_text: string | null
          question: string
          subject_id: string | null
          topic_id: string
          type: Database['public']['Enums']['question_type']
          updated_at: string
        }
        Insert: {
          answer?: string | null
          created_at?: string | null
          explanation?: string | null
          grade_level_id?: string | null
          id?: string
          image_hash?: string | null
          image_path?: string | null
          option_1_image_path?: string | null
          option_1_is_correct?: boolean | null
          option_1_text?: string | null
          option_2_image_path?: string | null
          option_2_is_correct?: boolean | null
          option_2_text?: string | null
          option_3_image_path?: string | null
          option_3_is_correct?: boolean | null
          option_3_text?: string | null
          option_4_image_path?: string | null
          option_4_is_correct?: boolean | null
          option_4_text?: string | null
          question: string
          subject_id?: string | null
          topic_id: string
          type: Database['public']['Enums']['question_type']
          updated_at?: string
        }
        Update: {
          answer?: string | null
          created_at?: string | null
          explanation?: string | null
          grade_level_id?: string | null
          id?: string
          image_hash?: string | null
          image_path?: string | null
          option_1_image_path?: string | null
          option_1_is_correct?: boolean | null
          option_1_text?: string | null
          option_2_image_path?: string | null
          option_2_is_correct?: boolean | null
          option_2_text?: string | null
          option_3_image_path?: string | null
          option_3_is_correct?: boolean | null
          option_3_text?: string | null
          option_4_image_path?: string | null
          option_4_is_correct?: boolean | null
          option_4_text?: string | null
          question?: string
          subject_id?: string | null
          topic_id?: string
          type?: Database['public']['Enums']['question_type']
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'questions_grade_level_id_fkey'
            columns: ['grade_level_id']
            isOneToOne: false
            referencedRelation: 'grade_levels'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'questions_subject_id_fkey'
            columns: ['subject_id']
            isOneToOne: false
            referencedRelation: 'subjects'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'questions_topic_id_fkey'
            columns: ['topic_id']
            isOneToOne: false
            referencedRelation: 'sub_topics'
            referencedColumns: ['id']
          },
        ]
      }
      session_questions: {
        Row: {
          id: string
          question_id: string
          question_order: number
          session_id: string
        }
        Insert: {
          id?: string
          question_id: string
          question_order: number
          session_id: string
        }
        Update: {
          id?: string
          question_id?: string
          question_order?: number
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'session_questions_question_id_fkey'
            columns: ['question_id']
            isOneToOne: false
            referencedRelation: 'question_statistics'
            referencedColumns: ['question_id']
          },
          {
            foreignKeyName: 'session_questions_question_id_fkey'
            columns: ['question_id']
            isOneToOne: false
            referencedRelation: 'questions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'session_questions_session_id_fkey'
            columns: ['session_id']
            isOneToOne: false
            referencedRelation: 'practice_sessions'
            referencedColumns: ['id']
          },
        ]
      }
      student_profiles: {
        Row: {
          coins: number | null
          created_at: string | null
          current_streak: number
          food: number | null
          grade_level_id: string | null
          id: string
          preferred_language: string
          selected_pet_id: string | null
          subscription_tier: Database['public']['Enums']['subscription_tier']
          updated_at: string | null
          xp: number | null
        }
        Insert: {
          coins?: number | null
          created_at?: string | null
          current_streak?: number
          food?: number | null
          grade_level_id?: string | null
          id: string
          preferred_language?: string
          selected_pet_id?: string | null
          subscription_tier?: Database['public']['Enums']['subscription_tier']
          updated_at?: string | null
          xp?: number | null
        }
        Update: {
          coins?: number | null
          created_at?: string | null
          current_streak?: number
          food?: number | null
          grade_level_id?: string | null
          id?: string
          preferred_language?: string
          selected_pet_id?: string | null
          subscription_tier?: Database['public']['Enums']['subscription_tier']
          updated_at?: string | null
          xp?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'student_profiles_grade_level_id_fkey'
            columns: ['grade_level_id']
            isOneToOne: false
            referencedRelation: 'grade_levels'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'student_profiles_id_fkey'
            columns: ['id']
            isOneToOne: true
            referencedRelation: 'leaderboard'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'student_profiles_id_fkey'
            columns: ['id']
            isOneToOne: true
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'student_profiles_selected_pet_id_fkey'
            columns: ['selected_pet_id']
            isOneToOne: false
            referencedRelation: 'pets'
            referencedColumns: ['id']
          },
        ]
      }
      student_question_progress: {
        Row: {
          created_at: string
          cycle_number: number
          id: string
          question_id: string
          student_id: string
          topic_id: string
        }
        Insert: {
          created_at?: string
          cycle_number?: number
          id?: string
          question_id: string
          student_id: string
          topic_id: string
        }
        Update: {
          created_at?: string
          cycle_number?: number
          id?: string
          question_id?: string
          student_id?: string
          topic_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'student_question_progress_question_id_fkey'
            columns: ['question_id']
            isOneToOne: false
            referencedRelation: 'question_statistics'
            referencedColumns: ['question_id']
          },
          {
            foreignKeyName: 'student_question_progress_question_id_fkey'
            columns: ['question_id']
            isOneToOne: false
            referencedRelation: 'questions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'student_question_progress_student_id_fkey'
            columns: ['student_id']
            isOneToOne: false
            referencedRelation: 'leaderboard'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'student_question_progress_student_id_fkey'
            columns: ['student_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'student_question_progress_topic_id_fkey'
            columns: ['topic_id']
            isOneToOne: false
            referencedRelation: 'sub_topics'
            referencedColumns: ['id']
          },
        ]
      }
      sub_topics: {
        Row: {
          cover_image_path: string | null
          created_at: string | null
          display_order: number | null
          id: string
          name: string
          topic_id: string
          updated_at: string | null
        }
        Insert: {
          cover_image_path?: string | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          name: string
          topic_id: string
          updated_at?: string | null
        }
        Update: {
          cover_image_path?: string | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          name?: string
          topic_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'sub_topics_topic_id_fkey'
            columns: ['topic_id']
            isOneToOne: false
            referencedRelation: 'topics'
            referencedColumns: ['id']
          },
        ]
      }
      subjects: {
        Row: {
          cover_image_path: string | null
          created_at: string | null
          display_order: number | null
          grade_level_id: string
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          cover_image_path?: string | null
          created_at?: string | null
          display_order?: number | null
          grade_level_id: string
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          cover_image_path?: string | null
          created_at?: string | null
          display_order?: number | null
          grade_level_id?: string
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'subjects_grade_level_id_fkey'
            columns: ['grade_level_id']
            isOneToOne: false
            referencedRelation: 'grade_levels'
            referencedColumns: ['id']
          },
        ]
      }
      subscription_plans: {
        Row: {
          created_at: string | null
          features: Json | null
          id: Database['public']['Enums']['subscription_tier']
          is_highlighted: boolean | null
          name: string
          price_monthly: number
          sessions_per_day: number
          stripe_price_id: string | null
        }
        Insert: {
          created_at?: string | null
          features?: Json | null
          id: Database['public']['Enums']['subscription_tier']
          is_highlighted?: boolean | null
          name: string
          price_monthly: number
          sessions_per_day: number
          stripe_price_id?: string | null
        }
        Update: {
          created_at?: string | null
          features?: Json | null
          id?: Database['public']['Enums']['subscription_tier']
          is_highlighted?: boolean | null
          name?: string
          price_monthly?: number
          sessions_per_day?: number
          stripe_price_id?: string | null
        }
        Relationships: []
      }
      topics: {
        Row: {
          cover_image_path: string | null
          created_at: string | null
          display_order: number | null
          id: string
          name: string
          subject_id: string
          updated_at: string | null
        }
        Insert: {
          cover_image_path?: string | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          name: string
          subject_id: string
          updated_at?: string | null
        }
        Update: {
          cover_image_path?: string | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          name?: string
          subject_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'topics_subject_id_fkey'
            columns: ['subject_id']
            isOneToOne: false
            referencedRelation: 'subjects'
            referencedColumns: ['id']
          },
        ]
      }
      weekly_leaderboard_rewards: {
        Row: {
          coins_awarded: number
          created_at: string | null
          id: string
          rank: number
          seen_at: string | null
          student_id: string
          week_start: string
          weekly_xp: number
        }
        Insert: {
          coins_awarded: number
          created_at?: string | null
          id?: string
          rank: number
          seen_at?: string | null
          student_id: string
          week_start: string
          weekly_xp: number
        }
        Update: {
          coins_awarded?: number
          created_at?: string | null
          id?: string
          rank?: number
          seen_at?: string | null
          student_id?: string
          week_start?: string
          weekly_xp?: number
        }
        Relationships: [
          {
            foreignKeyName: 'weekly_leaderboard_rewards_student_id_fkey'
            columns: ['student_id']
            isOneToOne: false
            referencedRelation: 'leaderboard'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'weekly_leaderboard_rewards_student_id_fkey'
            columns: ['student_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      leaderboard: {
        Row: {
          avatar_path: string | null
          current_streak: number | null
          grade_level_name: string | null
          id: string | null
          name: string | null
          rank: number | null
          xp: number | null
        }
        Relationships: []
      }
      question_statistics: {
        Row: {
          attempts: number | null
          avg_time_seconds: number | null
          correct_count: number | null
          correctness_rate: number | null
          question_id: string | null
        }
        Relationships: []
      }
      weekly_leaderboard: {
        Row: {
          avatar_path: string | null
          current_streak: number | null
          grade_level_name: string | null
          id: string | null
          name: string | null
          rank: number | null
          total_xp: number | null
          weekly_xp: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      _weekly_leaderboard_data: {
        Args: never
        Returns: {
          avatar_path: string
          current_streak: number
          grade_level_name: string
          id: string
          name: string
          rank: number
          total_xp: number
          weekly_xp: number
        }[]
      }
      accept_parent_student_invitation: {
        Args: {
          p_accepting_user_id: string
          p_invitation_id: string
          p_is_parent: boolean
        }
        Returns: {
          link_id: string
          linked_at: string
          parent_email: string
          parent_id: string
          parent_name: string
          student_avatar_path: string
          student_email: string
          student_grade_level_name: string
          student_id: string
          student_name: string
        }[]
      }
      calculate_display_streak: {
        Args: { p_student_id: string }
        Returns: number
      }
      combine_pets: {
        Args: { p_owned_pet_ids: string[]; p_student_id: string }
        Returns: Json
      }
      complete_practice_session: {
        Args: { p_session_id: string }
        Returns: Json
      }
      create_practice_session: {
        Args: {
          p_cycle_number: number
          p_grade_level_id: string
          p_questions: Json
          p_student_id: string
          p_subject_id: string
          p_topic_id: string
        }
        Returns: string
      }
      create_user_profile: {
        Args: {
          p_date_of_birth?: string
          p_email: string
          p_name: string
          p_user_id: string
          p_user_type: string
        }
        Returns: undefined
      }
      distribute_weekly_leaderboard_rewards: { Args: never; Returns: undefined }
      evolve_pet: {
        Args: { p_owned_pet_id: string; p_student_id: string }
        Returns: Json
      }
      exchange_coins_for_food: {
        Args: { p_food_amount: number }
        Returns: undefined
      }
      feed_pet_for_evolution: {
        Args: {
          p_food_amount: number
          p_owned_pet_id: string
          p_student_id: string
        }
        Returns: Json
      }
      gacha_multi_pull: { Args: never; Returns: string[] }
      gacha_pull: { Args: never; Returns: string }
      get_question_statistics: {
        Args: never
        Returns: {
          attempts: number
          avg_time_seconds: number
          correct_count: number
          correctness_rate: number
          question_id: string
        }[]
      }
      get_student_profile_for_dialog: {
        Args: { p_student_id: string }
        Returns: Json
      }
      get_student_streak: { Args: { p_student_id: string }; Returns: number }
      get_tier_from_stripe_price: {
        Args: { p_price_id: string }
        Returns: Database['public']['Enums']['subscription_tier']
      }
      get_unread_announcement_count: { Args: never; Returns: number }
      initial_pet_draw: { Args: never; Returns: string }
      record_spin_reward: {
        Args: {
          p_daily_status_id: string
          p_reward: number
          p_student_id: string
        }
        Returns: undefined
      }
      refresh_question_statistics: { Args: never; Returns: undefined }
      update_student_streak: { Args: { p_student_id: string }; Returns: number }
    }
    Enums: {
      announcement_audience: 'all' | 'students_only' | 'parents_only'
      feedback_category:
        | 'question_error'
        | 'image_error'
        | 'option_error'
        | 'answer_error'
        | 'explanation_error'
        | 'other'
      invitation_direction: 'parent_to_student' | 'student_to_parent'
      invitation_status: 'pending' | 'accepted' | 'rejected' | 'cancelled'
      mood_type: 'sad' | 'neutral' | 'happy'
      pet_rarity: 'common' | 'rare' | 'epic' | 'legendary'
      question_type: 'mcq' | 'short_answer' | 'mrq'
      subscription_tier: 'core' | 'plus' | 'pro' | 'max'
      user_type: 'admin' | 'student' | 'parent'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      announcement_audience: ['all', 'students_only', 'parents_only'],
      feedback_category: [
        'question_error',
        'image_error',
        'option_error',
        'answer_error',
        'explanation_error',
        'other',
      ],
      invitation_direction: ['parent_to_student', 'student_to_parent'],
      invitation_status: ['pending', 'accepted', 'rejected', 'cancelled'],
      mood_type: ['sad', 'neutral', 'happy'],
      pet_rarity: ['common', 'rare', 'epic', 'legendary'],
      question_type: ['mcq', 'short_answer', 'mrq'],
      subscription_tier: ['core', 'plus', 'pro', 'max'],
      user_type: ['admin', 'student', 'parent'],
    },
  },
} as const
