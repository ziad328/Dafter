import { baseApi as api } from './base';
export const addTagTypes = [
  'system',
  'auth',
  'workspaces',
  'members',
  'curriculum',
  'groups',
  'sessions',
  'students',
] as const;
const injectedRtkApi = api
  .enhanceEndpoints({
    addTagTypes,
  })
  .injectEndpoints({
    endpoints: (build) => ({
      getHealth: build.query<GetHealthApiResponse, GetHealthApiArg>({
        query: () => ({ url: `/health` }),
        providesTags: ['system'],
      }),
      register: build.mutation<RegisterApiResponse, RegisterApiArg>({
        query: (queryArg) => ({
          url: `/api/v1/auth/register`,
          method: 'POST',
          body: queryArg.registerRequest,
        }),
        invalidatesTags: ['auth'],
      }),
      login: build.mutation<LoginApiResponse, LoginApiArg>({
        query: (queryArg) => ({
          url: `/api/v1/auth/login`,
          method: 'POST',
          body: queryArg.loginRequest,
        }),
        invalidatesTags: ['auth'],
      }),
      refresh: build.mutation<RefreshApiResponse, RefreshApiArg>({
        query: () => ({ url: `/api/v1/auth/refresh`, method: 'POST' }),
        invalidatesTags: ['auth'],
      }),
      logout: build.mutation<LogoutApiResponse, LogoutApiArg>({
        query: () => ({ url: `/api/v1/auth/logout`, method: 'POST' }),
        invalidatesTags: ['auth'],
      }),
      getMe: build.query<GetMeApiResponse, GetMeApiArg>({
        query: () => ({ url: `/api/v1/me` }),
        providesTags: ['auth'],
      }),
      createWorkspace: build.mutation<CreateWorkspaceApiResponse, CreateWorkspaceApiArg>({
        query: (queryArg) => ({
          url: `/api/v1/workspaces`,
          method: 'POST',
          body: queryArg.createWorkspaceRequest,
        }),
        invalidatesTags: ['workspaces'],
      }),
      listWorkspaces: build.query<ListWorkspacesApiResponse, ListWorkspacesApiArg>({
        query: () => ({ url: `/api/v1/workspaces` }),
        providesTags: ['workspaces'],
      }),
      getCurrentWorkspace: build.query<GetCurrentWorkspaceApiResponse, GetCurrentWorkspaceApiArg>({
        query: () => ({ url: `/api/v1/workspaces/current` }),
        providesTags: ['workspaces'],
      }),
      createInvite: build.mutation<CreateInviteApiResponse, CreateInviteApiArg>({
        query: (queryArg) => ({
          url: `/api/v1/invites`,
          method: 'POST',
          body: queryArg.createInviteRequest,
        }),
        invalidatesTags: ['members'],
      }),
      acceptInvite: build.mutation<AcceptInviteApiResponse, AcceptInviteApiArg>({
        query: (queryArg) => ({ url: `/api/v1/invites/${queryArg.token}/accept`, method: 'POST' }),
        invalidatesTags: ['members'],
      }),
      listMembers: build.query<ListMembersApiResponse, ListMembersApiArg>({
        query: () => ({ url: `/api/v1/members` }),
        providesTags: ['members'],
      }),
      setAssistantScopes: build.mutation<SetAssistantScopesApiResponse, SetAssistantScopesApiArg>({
        query: (queryArg) => ({
          url: `/api/v1/members/${queryArg.id}/scopes`,
          method: 'PUT',
          body: queryArg.setScopesRequest,
        }),
        invalidatesTags: ['members'],
      }),
      listSubjects: build.query<ListSubjectsApiResponse, ListSubjectsApiArg>({
        query: () => ({ url: `/api/v1/subjects` }),
        providesTags: ['curriculum'],
      }),
      listGradeLevels: build.query<ListGradeLevelsApiResponse, ListGradeLevelsApiArg>({
        query: () => ({ url: `/api/v1/grade-levels` }),
        providesTags: ['curriculum'],
      }),
      listGroups: build.query<ListGroupsApiResponse, ListGroupsApiArg>({
        query: () => ({ url: `/api/v1/groups` }),
        providesTags: ['groups'],
      }),
      createGroup: build.mutation<CreateGroupApiResponse, CreateGroupApiArg>({
        query: (queryArg) => ({
          url: `/api/v1/groups`,
          method: 'POST',
          body: queryArg.createGroupRequest,
        }),
        invalidatesTags: ['groups'],
      }),
      getGroup: build.query<GetGroupApiResponse, GetGroupApiArg>({
        query: (queryArg) => ({ url: `/api/v1/groups/${queryArg.id}` }),
        providesTags: ['groups'],
      }),
      updateGroup: build.mutation<UpdateGroupApiResponse, UpdateGroupApiArg>({
        query: (queryArg) => ({
          url: `/api/v1/groups/${queryArg.id}`,
          method: 'PATCH',
          body: queryArg.updateGroupRequest,
        }),
        invalidatesTags: ['groups'],
      }),
      listSessions: build.query<ListSessionsApiResponse, ListSessionsApiArg>({
        query: (queryArg) => ({
          url: `/api/v1/sessions`,
          params: {
            from: queryArg['from'],
            to: queryArg.to,
          },
        }),
        providesTags: ['sessions'],
      }),
      moveSession: build.mutation<MoveSessionApiResponse, MoveSessionApiArg>({
        query: (queryArg) => ({
          url: `/api/v1/sessions/${queryArg.id}`,
          method: 'PATCH',
          body: queryArg.moveSessionRequest,
        }),
        invalidatesTags: ['sessions'],
      }),
      cancelSession: build.mutation<CancelSessionApiResponse, CancelSessionApiArg>({
        query: (queryArg) => ({ url: `/api/v1/sessions/${queryArg.id}/cancel`, method: 'POST' }),
        invalidatesTags: ['sessions'],
      }),
      listStudents: build.query<ListStudentsApiResponse, ListStudentsApiArg>({
        query: (queryArg) => ({
          url: `/api/v1/students`,
          params: {
            q: queryArg.q,
          },
        }),
        providesTags: ['students'],
      }),
      createStudent: build.mutation<CreateStudentApiResponse, CreateStudentApiArg>({
        query: (queryArg) => ({
          url: `/api/v1/students`,
          method: 'POST',
          body: queryArg.createStudentRequest,
        }),
        invalidatesTags: ['students'],
      }),
      getStudent: build.query<GetStudentApiResponse, GetStudentApiArg>({
        query: (queryArg) => ({ url: `/api/v1/students/${queryArg.id}` }),
        providesTags: ['students'],
      }),
      updateStudent: build.mutation<UpdateStudentApiResponse, UpdateStudentApiArg>({
        query: (queryArg) => ({
          url: `/api/v1/students/${queryArg.id}`,
          method: 'PATCH',
          body: queryArg.updateStudentRequest,
        }),
        invalidatesTags: ['students'],
      }),
    }),
    overrideExisting: false,
  });
export { injectedRtkApi as api };
export type GetHealthApiResponse = /** status 200 The API is up */ HealthResponse;
export type GetHealthApiArg = void;
export type RegisterApiResponse = /** status 201 Signed in; sets the refresh cookie */ AuthResponse;
export type RegisterApiArg = {
  registerRequest: RegisterRequest;
};
export type LoginApiResponse = /** status 200 Signed in; sets the refresh cookie */ AuthResponse;
export type LoginApiArg = {
  loginRequest: LoginRequest;
};
export type RefreshApiResponse = /** status 200 Signed in; sets the refresh cookie */ AuthResponse;
export type RefreshApiArg = void;
export type LogoutApiResponse = unknown;
export type LogoutApiArg = void;
export type GetMeApiResponse = /** status 200 The signed-in user */ Me;
export type GetMeApiArg = void;
export type CreateWorkspaceApiResponse =
  /** status 201 Created; the caller is its owner */ Workspace;
export type CreateWorkspaceApiArg = {
  createWorkspaceRequest: CreateWorkspaceRequest;
};
export type ListWorkspacesApiResponse = /** status 200 The caller's workspaces */ WorkspaceList;
export type ListWorkspacesApiArg = void;
export type GetCurrentWorkspaceApiResponse = /** status 200 The active workspace */ Workspace;
export type GetCurrentWorkspaceApiArg = void;
export type CreateInviteApiResponse =
  /** status 201 The invite; its token is shown only here */ Invite;
export type CreateInviteApiArg = {
  createInviteRequest: CreateInviteRequest;
};
export type AcceptInviteApiResponse = /** status 200 The joined workspace */ Workspace;
export type AcceptInviteApiArg = {
  token: string;
};
export type ListMembersApiResponse = /** status 200 Members of the active workspace */ MemberList;
export type ListMembersApiArg = void;
export type SetAssistantScopesApiResponse = unknown;
export type SetAssistantScopesApiArg = {
  id: string;
  setScopesRequest: SetScopesRequest;
};
export type ListSubjectsApiResponse =
  /** status 200 Subjects of the active workspace */ CurriculumList;
export type ListSubjectsApiArg = void;
export type ListGradeLevelsApiResponse =
  /** status 200 Grade levels of the active workspace */ CurriculumList;
export type ListGradeLevelsApiArg = void;
export type ListGroupsApiResponse = /** status 200 Groups the caller can see */ GroupList;
export type ListGroupsApiArg = void;
export type CreateGroupApiResponse = /** status 201 Created */ Group;
export type CreateGroupApiArg = {
  createGroupRequest: CreateGroupRequest;
};
export type GetGroupApiResponse = /** status 200 The group */ Group;
export type GetGroupApiArg = {
  id: string;
};
export type UpdateGroupApiResponse = /** status 200 Updated */ Group;
export type UpdateGroupApiArg = {
  id: string;
  updateGroupRequest: UpdateGroupRequest;
};
export type ListSessionsApiResponse = /** status 200 Sessions the caller can see */ SessionList;
export type ListSessionsApiArg = {
  from: string;
  to: string;
};
export type MoveSessionApiResponse = /** status 200 Moved */ Session;
export type MoveSessionApiArg = {
  id: string;
  moveSessionRequest: MoveSessionRequest;
};
export type CancelSessionApiResponse = /** status 200 Cancelled */ Session;
export type CancelSessionApiArg = {
  id: string;
};
export type ListStudentsApiResponse = /** status 200 Students */ StudentList;
export type ListStudentsApiArg = {
  q?: string;
};
export type CreateStudentApiResponse = /** status 201 Created */ Student;
export type CreateStudentApiArg = {
  createStudentRequest: CreateStudentRequest;
};
export type GetStudentApiResponse = /** status 200 The student */ Student;
export type GetStudentApiArg = {
  id: string;
};
export type UpdateStudentApiResponse = /** status 200 Updated */ Student;
export type UpdateStudentApiArg = {
  id: string;
  updateStudentRequest: UpdateStudentRequest;
};
export type HealthResponse = {
  status: 'ok';
};
export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INVALID_CREDENTIALS'
  | 'PHONE_TAKEN'
  | 'EMAIL_TAKEN'
  | 'WORKSPACE_NOT_FOUND'
  | 'INVITE_INVALID'
  | 'ALREADY_MEMBER'
  | 'MEMBER_NOT_ASSISTANT'
  | 'SCOPE_TEACHER_INVALID'
  | 'GROUP_NOT_FOUND'
  | 'GROUP_REFERENCE_INVALID'
  | 'SESSION_NOT_FOUND'
  | 'SESSION_NOT_SCHEDULED'
  | 'SESSION_TIME_INVALID'
  | 'STUDENT_NOT_FOUND'
  | 'STUDENT_REFERENCE_INVALID'
  | 'INTERNAL';
export type ErrorResponse = {
  code: ErrorCode;
  details?: {
    [key: string]: any;
  };
};
export type Me = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  locale: 'ar' | 'en';
};
export type AuthResponse = {
  accessToken: string;
  user: Me;
};
export type RegisterRequest = {
  name: string;
  phone?: string;
  email?: string;
  password: string;
  locale?: 'ar' | 'en';
};
export type LoginRequest = {
  login: string;
  password: string;
};
export type Workspace = {
  id: string;
  type: 'center' | 'independent';
  nameAr: string;
  nameEn: string | null;
  timezone: string;
  role: 'owner' | 'teacher' | 'assistant';
};
export type CreateWorkspaceRequest = {
  type: 'center' | 'independent';
  nameAr: string;
  nameEn?: string;
};
export type WorkspaceList = Workspace[];
export type Invite = {
  id: string;
  role: 'teacher' | 'assistant';
  token: string;
  expiresAt: string;
};
export type CreateInviteRequest = {
  role: 'teacher' | 'assistant';
};
export type Member = {
  id: string;
  userId: string;
  name: string;
  phone: string | null;
  role: 'owner' | 'teacher' | 'assistant';
  teacherMembershipIds: string[];
};
export type MemberList = Member[];
export type SetScopesRequest = {
  teacherMembershipIds: string[];
};
export type CurriculumItem = {
  id: string;
  nameAr: string;
  nameEn: string;
};
export type CurriculumList = CurriculumItem[];
export type GroupSlotOutput = {
  weekday: number;
  startTime: string;
  endTime: string;
};
export type Group = {
  id: string;
  teacherMembershipId: string;
  teacherName: string;
  subject: CurriculumItem;
  gradeLevel: CurriculumItem;
  capacity: number | null;
  status: 'active' | 'archived';
  slots: GroupSlotOutput[];
};
export type GroupList = Group[];
export type GroupSlot = {
  weekday: number;
  startTime: string;
  endTime: string;
};
export type CreateGroupRequest = {
  teacherMembershipId?: string;
  subjectId: string;
  gradeLevelId: string;
  capacity?: number | null;
  slots: GroupSlot[];
};
export type UpdateGroupRequest = {
  teacherMembershipId?: string;
  subjectId?: string;
  gradeLevelId?: string;
  capacity?: number | null;
  status?: 'active' | 'archived';
  slots?: GroupSlot[];
};
export type Session = {
  id: string;
  groupId: string;
  startsAt: string;
  endsAt: string;
  status: 'scheduled' | 'open' | 'closed' | 'cancelled';
  moved: boolean;
  teacherMembershipId: string;
  teacherName: string;
  subject: CurriculumItem;
  gradeLevel: CurriculumItem;
};
export type SessionList = Session[];
export type MoveSessionRequest = {
  date: string;
  startTime: string;
  endTime: string;
};
export type Guardian = {
  id: string;
  name: string | null;
  phone: string;
  relation: 'father' | 'mother' | 'other';
  preferredLocale: 'ar' | 'en';
  whatsappOptIn: boolean;
  isPrimary: boolean;
};
export type Student = {
  id: string;
  nameAr: string;
  nameEn: string | null;
  phone: string | null;
  gradeLevel: CurriculumItem;
  school: string | null;
  status: 'active' | 'archived';
  guardians: Guardian[];
};
export type StudentList = Student[];
export type GuardianInput = {
  phone: string;
  name?: string;
  relation: 'father' | 'mother' | 'other';
  preferredLocale: 'ar' | 'en';
  whatsappOptIn: boolean;
};
export type CreateStudentRequest = {
  nameAr: string;
  nameEn?: string;
  phone?: string;
  gradeLevelId: string;
  school?: string;
  guardian: GuardianInput;
};
export type UpdateStudentRequest = {
  nameAr?: string;
  nameEn?: string | null;
  phone?: string | null;
  gradeLevelId?: string;
  school?: string | null;
  status?: 'active' | 'archived';
  guardian?: GuardianInput;
};
export const {
  useGetHealthQuery,
  useRegisterMutation,
  useLoginMutation,
  useRefreshMutation,
  useLogoutMutation,
  useGetMeQuery,
  useCreateWorkspaceMutation,
  useListWorkspacesQuery,
  useGetCurrentWorkspaceQuery,
  useCreateInviteMutation,
  useAcceptInviteMutation,
  useListMembersQuery,
  useSetAssistantScopesMutation,
  useListSubjectsQuery,
  useListGradeLevelsQuery,
  useListGroupsQuery,
  useCreateGroupMutation,
  useGetGroupQuery,
  useUpdateGroupMutation,
  useListSessionsQuery,
  useMoveSessionMutation,
  useCancelSessionMutation,
  useListStudentsQuery,
  useCreateStudentMutation,
  useGetStudentQuery,
  useUpdateStudentMutation,
} = injectedRtkApi;
